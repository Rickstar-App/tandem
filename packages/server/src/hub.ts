// Transport-agnostic connection handling: one hub per room, so it maps onto a Durable Object
// (one object per game) and onto a plain Node process the same way (BRIEF §6.1, §6.4, §6.6).

import { Room, decodeAction } from './room.ts';
import { seatToken } from './ids.ts';
import type { GameRecord, GameStore } from './store.ts';
import { type ClientMsg, type RoomSnapshot, type ServerMsg, type Team, type TimeControl, seatTeam } from './types.ts';

export const MAX_MSGS_PER_SEC = 30;
export const MAX_SPECTATORS = 50;
export const PROBE_EVERY_MS = 5_000;
const RTT_SAMPLES = 5;

export interface Sock {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface Conn {
  sock: Sock;
  token: string | null;
  /** Last team this connection was told it holds, so re-seating can be pushed to it. */
  lastTeam: Team | null;
  spectator: boolean;
  name: string;
  /** Sliding window of message timestamps for rate limiting. */
  recent: number[];
  rtts: number[];
  lastProbeAt: number;
  probeTs: number | null;
}

export interface HubDeps {
  now(): number;
  /** Ask the host to wake the hub at `at` (Durable Object alarm, or setTimeout). */
  setTimer(at: number | null): void;
  store?: GameStore;
  newToken?(): string;
  rnd?(): number;
}

export class Hub {
  readonly room: Room;
  private conns = new Set<Conn>();
  private deps: HubDeps;
  private saved = false;
  private lastClaimable = '';
  private startedAt: number;

  constructor(id: string, deps: HubDeps) {
    this.deps = deps;
    this.room = new Room(id, { newToken: deps.newToken ?? seatToken, rnd: deps.rnd }, deps.now());
    this.startedAt = deps.now();
  }

  // ---- connection lifecycle ----------------------------------------------

  open(sock: Sock): Conn {
    const c: Conn = { sock, token: null, lastTeam: null, spectator: false, name: '', recent: [], rtts: [], lastProbeAt: 0, probeTs: null };
    this.conns.add(c);
    return c;
  }

  close(c: Conn): void {
    if (!this.conns.has(c)) return;
    this.conns.delete(c);
    const now = this.deps.now();
    const team = c.token ? this.room.teamByToken(c.token) : null;
    if (team) {
      // A second tab on the same seat keeps the seat present.
      const stillHere = [...this.conns].some(o => o.token && this.room.teamByToken(o.token) === team);
      if (!stillHere) {
        this.emit(this.room.leave(team, now).events);
        this.broadcastSnapshot();
      }
    } else if (c.spectator) {
      this.room.leave(null, now);
      this.broadcastSnapshot();
    }
    this.reschedule();
  }

  private send(c: Conn, m: ServerMsg) { try { c.sock.send(JSON.stringify(m)); } catch { /* socket already gone */ } }
  private emit(events: ServerMsg[]) { for (const e of events) for (const c of this.conns) this.send(c, e); }

  /**
   * Seats move between teams: the host picking a side, a random draw resolving, a rematch
   * swapping sides. Tell any connection whose team changed before it reads the next snapshot.
   */
  private syncIdentity(): void {
    for (const c of this.conns) {
      if (!c.token) continue;
      const team = this.room.teamByToken(c.token);
      if (team === c.lastTeam) continue;
      c.lastTeam = team;
      this.send(c, { type: 'joined', team, seatToken: c.token, name: c.name });
    }
  }

  broadcastSnapshot(): void {
    this.syncIdentity();
    const now = this.deps.now();
    const snap = this.room.snapshot(now);
    const msg: ServerMsg = { type: 'snapshot', seq: ++this.room.seq, serverTs: now, room: snap };
    for (const c of this.conns) this.send(c, msg);
  }

  // ---- messages -----------------------------------------------------------

  message(c: Conn, raw: string): void {
    const now = this.deps.now();
    c.recent = c.recent.filter(t => now - t < 1000);
    if (c.recent.length >= MAX_MSGS_PER_SEC) { this.send(c, { type: 'reject', reason: 'too many messages' }); return; }
    c.recent.push(now);

    let msg: ClientMsg;
    try { msg = JSON.parse(raw) as ClientMsg; } catch { this.send(c, { type: 'reject', reason: 'malformed json' }); return; }
    if (!msg || typeof msg !== 'object' || typeof (msg as ClientMsg).type !== 'string') {
      this.send(c, { type: 'reject', reason: 'malformed message' }); return;
    }

    if (msg.type === 'ping') {
      // A ping echoing our probe timestamp measures the round trip; anything else is a clock sync.
      if (c.probeTs !== null && msg.t === c.probeTs) {
        c.rtts.push(now - c.probeTs); if (c.rtts.length > RTT_SAMPLES) c.rtts.shift();
        c.probeTs = null;
      } else {
        this.send(c, { type: 'pong', t: msg.t, serverTs: now });
      }
      return;
    }

    if (msg.type === 'join') return this.onJoin(c, msg, now);

    // Anyone, player or watcher, may ask for the current state after a dropped message.
    if (msg.type === 'resync') {
      this.send(c, { type: 'snapshot', seq: this.room.seq, serverTs: now, room: this.room.snapshot(now) });
      return;
    }

    const team = c.token ? this.room.teamByToken(c.token) : null;
    if (!team) { this.send(c, { type: 'reject', reason: 'spectators cannot act' }); return; }

    let out: { ok: boolean; reason?: string; events: ServerMsg[] };
    switch (msg.type) {
      case 'setup': out = this.room.setup(team, msg, now); break;
      case 'ready': out = this.room.setReady(team, msg.value === true, now); break;
      case 'rename': out = this.room.rename(team, msg.name, now); break;
      case 'action': {
        if (msg.board !== 'A' && msg.board !== 'B') { out = { ok: false, reason: 'bad board', events: [] }; break; }
        if (!decodeAction(msg.action)) { out = { ok: false, reason: 'malformed action', events: [] }; break; }
        out = this.room.act(team, msg.board, msg, now, this.rtt(c));
        break;
      }
      case 'resign': out = this.room.resign(team, now); break;
      case 'drawOffer': out = this.room.offerDraw(team, now); break;
      case 'drawAccept': out = this.room.acceptDraw(team, now); break;
      case 'drawDecline': out = this.room.declineDraw(team, now); break;
      case 'claimWin': out = this.room.claimWin(team, now); break;
      case 'rematch': out = this.room.requestRematch(team, now); break;
      default: out = { ok: false, reason: 'unknown message', events: [] };
    }

    if (!out.ok) { this.send(c, { type: 'reject', reason: out.reason ?? 'rejected' }); return; }
    this.emit(out.events);
    // Action events carry their own delta; everything else re-syncs with a snapshot.
    if (msg.type !== 'action' || out.events.some(e => e.type === 'ended')) this.broadcastSnapshot();
    this.afterStateChange();
  }

  private rtt(c: Conn): number {
    if (!c.rtts.length) return 0;
    const s = [...c.rtts].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  }

  private onJoin(c: Conn, msg: Extract<ClientMsg, { type: 'join' }>, now: number): void {
    if (c.token) { this.send(c, { type: 'reject', reason: 'already joined' }); return; }
    const wantsSeat = !msg.spectate;
    const seatsFull = !!this.room.players.WA && !!this.room.players.BA
      && !(msg.seatToken && this.room.teamByToken(msg.seatToken));
    if ((!wantsSeat || seatsFull) && this.room.spectators >= MAX_SPECTATORS) {
      this.send(c, { type: 'reject', reason: 'this table already has the maximum number of watchers' });
      c.sock.close(4003, 'full'); return;
    }
    const res = this.room.join(msg, now);
    c.name = res.name;
    if (res.team) {
      c.token = res.token ?? this.room.players[res.team]!.token;
      c.lastTeam = res.team;
      this.send(c, { type: 'joined', team: res.team, seatToken: c.token, name: res.name });
    } else {
      c.spectator = true;
      this.send(c, { type: 'joined', team: null, name: res.name });
    }
    this.emit(res.events);
    this.broadcastSnapshot();
    this.afterStateChange();
  }

  // ---- timers -------------------------------------------------------------

  /** Called by the host when the scheduled time arrives. */
  wake(): void {
    const now = this.deps.now();
    const phaseBefore = this.room.phase;
    const out = this.room.tick(now);
    const claim = JSON.stringify(this.room.claimable(now));
    const phaseChanged = this.room.phase !== phaseBefore;   // countdown -> playing arrives on a timer
    const claimChanged = claim !== this.lastClaimable;
    this.lastClaimable = claim;
    if (out.events.length) { this.emit(out.events); this.broadcastSnapshot(); }
    else if (phaseChanged || claimChanged) this.broadcastSnapshot();
    this.probe(now);
    this.afterStateChange();
  }

  private probe(now: number): void {
    for (const c of this.conns) {
      if (now - c.lastProbeAt >= PROBE_EVERY_MS) {
        c.lastProbeAt = now; c.probeTs = now;
        this.send(c, { type: 'pong', t: now, serverTs: now });
      }
    }
  }

  private afterStateChange(): void {
    const now = this.deps.now();
    // The countdown ends without any client message, so it always needs a wake-up.
    if (this.room.phase === 'countdown') { this.reschedule(); return; }
    if (this.room.phase === 'over' && !this.saved) { this.saved = true; void this.persist(); }
    else if (this.room.phase !== 'over' && this.saved) this.saved = false; // a rematch starts a new game to save
    this.reschedule();
  }

  private reschedule(): void {
    const now = this.deps.now();
    const d = this.room.nextDeadline();
    const probeAt = this.conns.size ? now + PROBE_EVERY_MS : null;
    const at = d === null ? probeAt : probeAt === null ? d : Math.min(d, probeAt);
    this.deps.setTimer(at);
  }

  private async persist(): Promise<void> {
    const r = this.room;
    if (!this.deps.store || !r.result) return;
    if (r.result.reason === 'abort' || r.result.reason === 'void') return; // nothing worth replaying
    const rec: GameRecord = {
      id: r.id,
      endedAt: this.deps.now(),
      startedAt: this.startedAt,
      tc: r.tc,
      players: { WA: r.players.WA?.name ?? 'White-A', BA: r.players.BA?.name ?? 'Black-A' },
      result: r.result,
      ply: r.ply,
      finalFen: { A: r.fen('A'), B: r.fen('B') },
    };
    try { await this.deps.store.put(rec); } catch { /* replay is best-effort; the live result already shipped */ }
  }

  get connectionCount(): number { return this.conns.size; }
}
