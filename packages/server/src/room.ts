// Authoritative room state machine (BRIEF §3.6, §3.7, §6.2, §6.5). Pure with respect to time:
// every method takes `now` (epoch ms), so the clock rules are deterministically testable.

import { type Action, type Board, type BoardStatus, type Color, DEFAULT_OPTIONS, type DropType, type Game, apply, legal, newGame, parseFen, result as gameResult, san, status as boardStatusOf, toFen } from '@tandem/engine';
import { type ClientMsg, DEFAULT_TC, type EndReason, type Phase, type PlyRecord, type Result, type RoomSnapshot, SEATS, type SeatId, type ServerMsg, type Team, type TimeControl, otherTeam, seatBoard, seatColor, seatOf, seatTeam } from './types.ts';

export const COUNTDOWN_MS = 3_000;
export const ABORT_MS = 30_000;
export const DRAW_OFFER_MS = 30_000;
export const DRAW_REOFFER_BLOCK_MS = 60_000;
export const REMATCH_MS = 60_000;
export const CLAIM_AFTER_MS = 60_000;
export const VOID_AFTER_MS = 300_000;
export const TABLE_EXPIRY_MS = 1_800_000;
/** How long a finished room stays in memory after the last player leaves. */
export const FINISHED_ROOM_TTL_MS = 300_000;
export const LAG_CREDIT_CAP_MS = 150;

export interface Seated { name: string; token: string; connected: boolean; disconnectedSince: number | null }
export interface Outcome { ok: boolean; reason?: string; events: ServerMsg[] }

const ok = (events: ServerMsg[] = []): Outcome => ({ ok: true, events });
const no = (reason: string): Outcome => ({ ok: false, reason, events: [] });

export function validTimeControl(tc: unknown): tc is TimeControl {
  if (!tc || typeof tc !== 'object') return false;
  const { baseMin, incSec } = tc as TimeControl;
  return Number.isInteger(baseMin) && baseMin >= 1 && baseMin <= 30
    && Number.isInteger(incSec) && incSec >= 0 && incSec <= 10;
}

/** BRIEF §4.1: 1-20 chars of letters, digits, space, _ - . ; blank becomes Guest####. */
export function cleanName(raw: unknown, rnd: () => number = Math.random): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 20).trim() : '';
  return s || `Guest${String(Math.floor(rnd() * 10000)).padStart(4, '0')}`;
}

export interface RoomDeps {
  /** 128-bit seat token as 32 hex chars. */
  newToken(): string;
  rnd?(): number;
}

export class Room {
  readonly id: string;
  readonly createdAt: number;
  private deps: RoomDeps;

  phase: Phase = 'setup';
  tc: TimeControl = DEFAULT_TC;
  hostTeam: Team | 'random' = 'WA';
  players: Record<Team, Seated | null> = { WA: null, BA: null };
  ready: Record<Team, boolean> = { WA: false, BA: false };
  spectators = 0;

  game: Game = newGame(DEFAULT_OPTIONS);
  clocks: Record<SeatId, number>;
  clocksAt = 0;
  startAt: number | null = null;
  turnStart: Record<SeatId, number>;
  ply: PlyRecord[] = [];
  result: Result | null = null;
  drawOffer: { by: Team; until: number } | null = null;
  drawBlockedUntil: Record<Team, number> = { WA: 0, BA: 0 };
  rematch: { by: Team; until: number } | null = null;
  seq = 0;

  constructor(id: string, deps: RoomDeps, createdAt = Date.now()) {
    this.id = id; this.deps = deps; this.createdAt = createdAt;
    this.clocks = this.freshClocks();
    this.turnStart = { 'A-w': 0, 'A-b': 0, 'B-w': 0, 'B-b': 0 };
  }

  private freshClocks(): Record<SeatId, number> {
    const ms = this.tc.baseMin * 60_000;
    return { 'A-w': ms, 'A-b': ms, 'B-w': ms, 'B-b': ms };
  }

  get lowTimeMs(): number { return Math.min(20_000, this.tc.baseMin * 60_000 * 0.1); }

  /** Seats whose clock is burning: the side to move on each board while playing (BRIEF §3.7). */
  running(): SeatId[] {
    if (this.phase !== 'playing') return [];
    return (['A', 'B'] as Board[]).map(b => `${b}-${this.game.pos[b].turn}` as SeatId);
  }

  private nameOf(t: Team): string { return this.players[t]?.name ?? (t === 'WA' ? 'White-A' : 'Black-A'); }

  // ---- clocks -------------------------------------------------------------

  /** Advance clocks to `now`. `credit` is the lag credit added back to one seat (BRIEF §6.2). */
  private settle(now: number, credit?: { seat: SeatId; ms: number }): void {
    if (this.phase === 'playing') {
      const dt = now - this.clocksAt;
      if (dt > 0) for (const s of this.running()) this.clocks[s] = this.clocks[s] - dt;
    }
    if (credit && credit.ms > 0) this.clocks[credit.seat] = this.clocks[credit.seat] + credit.ms;
    // Only ever advance. If the system clock steps backwards, moving the settle point back with
    // it would make the following settle charge the same stretch of time twice.
    if (now > this.clocksAt) this.clocksAt = now;
  }

  /** Earliest moment the room must be woken for a timed transition, or null. */
  nextDeadline(): number | null {
    const cands: number[] = [];
    if (this.phase === 'countdown' && this.startAt !== null) cands.push(this.startAt);
    if (this.phase === 'playing') {
      for (const s of this.running()) cands.push(this.clocksAt + this.clocks[s]);
      if (this.ply.length === 0 && this.startAt !== null) cands.push(this.startAt + ABORT_MS);
      if (this.drawOffer) cands.push(this.drawOffer.until);
      const dcs = (['WA', 'BA'] as Team[]).map(t => this.players[t]?.disconnectedSince ?? null);
      if (dcs.every(d => d !== null)) cands.push(Math.max(dcs[0]!, dcs[1]!) + VOID_AFTER_MS);
      for (const d of dcs) if (d !== null) cands.push(d + CLAIM_AFTER_MS);
    }
    if (this.rematch) cands.push(this.rematch.until);
    return cands.length ? Math.min(...cands) : null;
  }

  // ---- lifecycle ----------------------------------------------------------

  /** When the game ended, so a finished room can be released once nobody is looking at it. */
  endedAt: number | null = null;

  /**
   * True when this room can be dropped from memory: an unjoined table after 30 minutes
   * (BRIEF §4.1), or a finished game once the result has had time to be read. The result
   * itself lives in the game store, so dropping the room never loses a replay.
   */
  isExpired(now: number): boolean {
    if (this.phase === 'over' && this.endedAt !== null) return now - this.endedAt > FINISHED_ROOM_TTL_MS;
    if ((this.players.WA && this.players.BA) || this.ply.length) return false;
    return now - this.createdAt > TABLE_EXPIRY_MS;
  }

  join(msg: Extract<ClientMsg, { type: 'join' }>, now: number): Outcome & { team: Team | null; token?: string; name: string } {
    const rnd = this.deps.rnd ?? Math.random;
    // Reclaiming a seat with a token survives refresh and reconnection (BRIEF §4.1, §6.6).
    if (msg.seatToken) {
      for (const t of ['WA', 'BA'] as Team[]) {
        const p = this.players[t];
        if (p && p.token === msg.seatToken) {
          const was = p.connected;
          p.connected = true; p.disconnectedSince = null;
          const events: ServerMsg[] = was ? [] : [{ type: 'presence', seq: ++this.seq, team: t, connected: true }];
          return { ...ok(events), team: t, name: p.name };
        }
      }
    }
    if (msg.spectate) { this.spectators++; return { ...ok(), team: null, name: cleanName(msg.name, rnd) }; }
    const free = (['WA', 'BA'] as Team[]).filter(t => !this.players[t]);
    if (!free.length) { this.spectators++; return { ...ok(), team: null, name: cleanName(msg.name, rnd) }; }
    // The host takes their chosen team; the guest takes what is left.
    const isHost = !this.players.WA && !this.players.BA;
    const team = isHost ? (this.hostTeam === 'random' ? 'WA' : this.hostTeam) : free[0]!;
    const name = cleanName(msg.name, rnd);
    const token = this.deps.newToken();
    this.players[team] = { name, token, connected: true, disconnectedSince: null };
    if (this.hostToken === null) this.hostToken = token;
    return { ...ok([{ type: 'presence', seq: ++this.seq, team, connected: true }]), team, token, name };
  }

  leave(team: Team | null, now: number): Outcome {
    if (team === null) { this.spectators = Math.max(0, this.spectators - 1); return ok(); }
    const p = this.players[team];
    if (!p) return ok();
    p.connected = false; p.disconnectedSince = now;
    if (this.phase === 'setup') this.ready[team] = false;
    return ok([{ type: 'presence', seq: ++this.seq, team, connected: false }]);
  }

  setup(team: Team, msg: Extract<ClientMsg, { type: 'setup' }>, now: number): Outcome {
    if (this.phase !== 'setup') return no('the game has already started');
    if (team !== this.hostOf()) return no('only the host can change the table');
    if (this.ready[otherTeam(team)]) return no('your opponent is ready; they must un-ready first');
    if (msg.tc !== undefined) {
      if (!validTimeControl(msg.tc)) return no('time control out of range');
      this.tc = { baseMin: msg.tc.baseMin, incSec: msg.tc.incSec };
      this.clocks = this.freshClocks();
    }
    if (msg.team !== undefined) {
      if (msg.team !== 'WA' && msg.team !== 'BA' && msg.team !== 'random') return no('bad team');
      this.hostTeam = msg.team;
      if (msg.team !== 'random') this.seatHostOn(msg.team);
    }
    this.ready = { WA: false, BA: false }; // any change clears both Ready flags (BRIEF §4.1)
    return ok();
  }

  /** The host is identified by seat token, so re-seating between teams never loses the role. */
  hostToken: string | null = null;
  hostOf(): Team {
    for (const t of ['WA', 'BA'] as Team[]) if (this.players[t]?.token === this.hostToken) return t;
    return this.players.WA ? 'WA' : 'BA';
  }
  /** Team holding a given seat token, or null. Adapters resolve per message, never cache. */
  teamByToken(token: string): Team | null {
    for (const t of ['WA', 'BA'] as Team[]) if (this.players[t]?.token === token) return t;
    return null;
  }
  /** Move the host (and the guest, if seated) so the host holds `t`. */
  private seatHostOn(t: Team): void {
    const cur = this.hostOf();
    if (cur === t) return;
    const a = this.players.WA, b = this.players.BA;
    this.players = { WA: b, BA: a };
  }

  /** Change your display name while the table is still being set up (BRIEF §4.1 item 2). */
  rename(team: Team, raw: unknown, now: number): Outcome {
    if (this.phase !== 'setup' && this.phase !== 'countdown') return no('the game has already started');
    const p = this.players[team];
    if (!p) return no('no seat');
    p.name = cleanName(raw, this.deps.rnd ?? Math.random);
    return ok();
  }

  setReady(team: Team, value: boolean, now: number): Outcome {
    if (this.phase !== 'setup') return no('not in setup');
    if (!this.players.WA || !this.players.BA) return no('waiting for an opponent');
    this.ready[team] = value;
    if (this.ready.WA && this.ready.BA) {
      // 'random' is resolved now, at the start of the game (BRIEF §4.1).
      if (this.hostTeam === 'random') {
        const rnd = this.deps.rnd ?? Math.random;
        this.seatHostOn(rnd() < 0.5 ? 'WA' : 'BA');
      }
      this.phase = 'countdown';
      this.startAt = now + COUNTDOWN_MS;
    }
    return ok();
  }

  tick(now: number): Outcome {
    const events: ServerMsg[] = [];
    if (this.phase === 'countdown' && this.startAt !== null && now >= this.startAt) {
      this.phase = 'playing';
      this.clocksAt = this.startAt;
      for (const s of this.running()) this.turnStart[s] = this.startAt;
    }
    if (this.phase === 'playing') {
      this.settle(now);
      const flagged = this.running().filter(s => this.clocks[s] <= 0);
      if (flagged.length) return this.endByFlags(flagged, now);
      if (this.ply.length === 0 && this.startAt !== null && now >= this.startAt + ABORT_MS) {
        return this.end({ winner: null, reason: 'abort', text: 'Aborted: no moves were made.' }, now);
      }
      if (this.drawOffer && now >= this.drawOffer.until) this.drawOffer = null;
      const dcs = (['WA', 'BA'] as Team[]).map(t => this.players[t]?.disconnectedSince ?? null);
      if (dcs[0] !== null && dcs[1] !== null && now >= Math.max(dcs[0]!, dcs[1]!) + VOID_AFTER_MS) {
        return this.end({ winner: null, reason: 'void', text: 'Voided: both players disconnected.' }, now);
      }
    }
    if (this.rematch && now >= this.rematch.until) this.rematch = null;
    return ok(events);
  }

  private endByFlags(flagged: SeatId[], now: number): Outcome {
    const teams = new Set(flagged.map(seatTeam));
    if (teams.size === 2) {
      return this.end({
        winner: null, reason: 'draw-flags',
        text: 'Draw: a clock ran out on each team at the same moment.',
      }, now);
    }
    const loser = [...teams][0]!;
    const winner = otherTeam(loser);
    const board = seatBoard(flagged[0]!);
    return this.end({
      winner, reason: 'flag', board,
      text: `${this.nameOf(winner)} wins: ${this.nameOf(loser)}'s clock ran out on Board ${board}.`,
    }, now);
  }

  private end(result: Result, now: number): Outcome {
    this.settle(now);
    this.phase = 'over';
    this.result = result;
    this.endedAt = now;
    this.drawOffer = null;
    for (const s of SEATS) if (this.clocks[s] < 0) this.clocks[s] = 0;
    return ok([{ type: 'ended', seq: ++this.seq, serverTs: now, result, room: this.snapshot(now) }]);
  }

  // ---- play ---------------------------------------------------------------

  act(team: Team, board: Board, raw: ClientMsg & { type: 'action' }, now: number, rttMs = 0): Outcome {
    if (this.phase !== 'playing') return no('the game is not running');
    const seat = seatOf(team, board);
    if (this.game.pos[board].turn !== seatColor(seat)) return no('not your turn on that board');

    const elapsedThisMove = Math.max(0, now - this.turnStart[seat]);
    const credit = Math.min(Math.max(0, rttMs) / 2, LAG_CREDIT_CAP_MS, elapsedThisMove);

    // Decide flag-vs-action strictly by the mover's effective arrival time (BRIEF §3.6.1).
    const dt = now - this.clocksAt;
    const moverRemaining = this.clocks[seat] - dt + credit;
    if (moverRemaining <= 0) {
      this.settle(now);
      const flagged = this.running().filter(s => this.clocks[s] <= 0);
      return this.endByFlags(flagged.length ? flagged : [seat], now);
    }
    // Another seat may have flagged before this action arrived; that event wins.
    this.settle(now, { seat, ms: credit });
    const others = this.running().filter(s => s !== seat && this.clocks[s] <= 0);
    if (others.length) return this.endByFlags(others, now);

    const action = decodeAction(raw.action);
    if (!action) return no('malformed action');
    let sanText: string;
    try { sanText = san(this.game, board, action); } catch { return no('illegal action'); }

    const applied = apply(this.game, board, action);
    this.game = applied.game;
    this.clocks[seat] = this.clocks[seat] + this.tc.incSec * 1000;

    const nextSeat = `${board}-${this.game.pos[board].turn}` as SeatId;
    this.turnStart[nextSeat] = now;

    const rec: PlyRecord = {
      n: this.ply.length + 1,
      board, color: seatColor(seat), san: sanText,
      action: raw.action,
      serverTs: now,
      clocks: { ...this.clocks },
      fen: { A: this.fen('A'), B: this.fen('B') },
      ...(applied.transfer ? { transfer: { ...applied.transfer } } : {}),
    };
    this.ply.push(rec);
    // Any action makes a standing draw offer stale.
    if (this.drawOffer && this.drawOffer.by !== team) this.drawOffer = null;

    const events: ServerMsg[] = [{
      type: 'action', seq: ++this.seq, serverTs: now, ply: rec,
      clocksAt: this.clocksAt, running: this.running(),
      status: { A: boardStatusOf(this.game, 'A'), B: boardStatusOf(this.game, 'B') },
    }];

    const res = gameResult(this.game);
    if (res.over) {
      const loserTeam = seatTeam(`${res.board}-${res.loser}` as SeatId);
      const winner = otherTeam(loserTeam);
      const endEv = this.end({
        winner, reason: 'mate', board: res.board,
        text: `${this.nameOf(winner)} wins on Board ${res.board}: checkmate.`,
      }, now);
      return ok([...events, ...endEv.events]);
    }
    return ok(events);
  }

  resign(team: Team, now: number): Outcome {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return no('the game is not running');
    const winner = otherTeam(team);
    return this.end({
      winner, reason: 'resign',
      text: `${this.nameOf(winner)} wins: ${this.nameOf(team)} resigned.`,
    }, now);
  }

  offerDraw(team: Team, now: number): Outcome {
    if (this.phase !== 'playing') return no('the game is not running');
    if (this.drawOffer) return no('a draw offer is already open');
    if (now < this.drawBlockedUntil[team]) {
      return no(`wait ${Math.ceil((this.drawBlockedUntil[team] - now) / 1000)}s before offering again`);
    }
    this.drawOffer = { by: team, until: now + DRAW_OFFER_MS };
    return ok();
  }

  acceptDraw(team: Team, now: number): Outcome {
    if (!this.drawOffer || this.drawOffer.by === team) return no('no draw offer to accept');
    if (now >= this.drawOffer.until) { this.drawOffer = null; return no('the draw offer expired'); }
    return this.end({ winner: null, reason: 'draw-agreed', text: 'Draw by agreement.' }, now);
  }

  declineDraw(team: Team, now: number): Outcome {
    if (!this.drawOffer || this.drawOffer.by === team) return no('no draw offer to decline');
    const by = this.drawOffer.by;
    this.drawOffer = null;
    this.drawBlockedUntil[by] = now + DRAW_REOFFER_BLOCK_MS;
    return ok();
  }

  claimWin(team: Team, now: number): Outcome {
    if (this.phase !== 'playing') return no('the game is not running');
    const foe = otherTeam(team);
    const since = this.players[foe]?.disconnectedSince ?? null;
    if (since === null || now - since < CLAIM_AFTER_MS) return no('your opponent is still connected');
    return this.end({
      winner: team, reason: 'abandon',
      text: `${this.nameOf(team)} wins: ${this.nameOf(foe)} disconnected.`,
    }, now);
  }

  /** Request or accept a rematch. Teams swap; the time control is unchanged (BRIEF §4.1). */
  requestRematch(team: Team, now: number): Outcome {
    if (this.phase !== 'over') return no('the game is still running');
    if (this.rematch && this.rematch.by !== team && now < this.rematch.until) {
      const wa = this.players.WA, ba = this.players.BA;
      this.players = { WA: ba, BA: wa };
      this.game = newGame(DEFAULT_OPTIONS);
      this.clocks = this.freshClocks();
      this.ply = []; this.result = null; this.rematch = null;
      this.drawBlockedUntil = { WA: 0, BA: 0 };
      this.ready = { WA: true, BA: true };
      this.phase = 'countdown';
      this.startAt = now + COUNTDOWN_MS;
      this.clocksAt = this.startAt;
      return ok();
    }
    this.rematch = { by: team, until: now + REMATCH_MS };
    return ok();
  }

  // ---- views --------------------------------------------------------------

  fen(b: Board): string {
    return toFen(this.game.pos[b], { w: this.game.reserve[b].w, b: this.game.reserve[b].b });
  }

  claimable(now: number): Record<Team, boolean> {
    const f = (t: Team) => {
      const since = this.players[otherTeam(t)]?.disconnectedSince ?? null;
      return this.phase === 'playing' && since !== null && now - since >= CLAIM_AFTER_MS;
    };
    return { WA: f('WA'), BA: f('BA') };
  }

  snapshot(now: number): RoomSnapshot {
    const pub = (t: Team) => { const p = this.players[t]; return p ? { name: p.name, connected: p.connected } : null; };
    return {
      id: this.id,
      phase: this.phase,
      tc: this.tc,
      startAt: this.startAt,
      players: { WA: pub('WA'), BA: pub('BA') },
      ready: { ...this.ready },
      spectators: this.spectators,
      fen: { A: this.fen('A'), B: this.fen('B') },
      status: { A: boardStatusOf(this.game, 'A'), B: boardStatusOf(this.game, 'B') },
      turn: { A: this.game.pos.A.turn, B: this.game.pos.B.turn },
      clocks: { ...this.clocks },
      clocksAt: this.clocksAt,
      running: this.running(),
      lowTimeMs: this.lowTimeMs,
      ply: this.ply,
      result: this.result,
      drawOffer: this.drawOffer,
      rematch: this.rematch,
      claimable: this.claimable(now),
      hostTeam: this.hostTeam,
      host: this.players.WA || this.players.BA ? this.hostOf() : null,
    };
  }
}

export function decodeAction(a: unknown): Action | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as Record<string, unknown>;
  const sq = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 64 ? (v as number) : null);
  if (x.kind === 'move') {
    const from = sq(x.from), to = sq(x.to);
    if (from === null || to === null) return null;
    if (x.promo !== undefined && !['q', 'r', 'b', 'n'].includes(x.promo as string)) return null;
    return x.promo ? { kind: 'move', from, to, promo: x.promo as 'q' } : { kind: 'move', from, to };
  }
  if (x.kind === 'drop') {
    const to = sq(x.to);
    if (to === null || !['p', 'n', 'b', 'r', 'q'].includes(x.piece as string)) return null;
    return { kind: 'drop', piece: x.piece as DropType, to };
  }
  return null;
}
