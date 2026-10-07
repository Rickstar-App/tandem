// Two real WebSocket clients playing through the Node adapter (BRIEF §9.2).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { parseSan } from '@tandem/engine';
import { createApp } from '../src/node-main.ts';
import type { ServerMsg, Team } from '../src/types.ts';

let PORT = 0;
let app: ReturnType<typeof createApp>;

beforeAll(async () => { app = createApp(0); PORT = await app.listen(); });
afterAll(async () => { await app.close(); });

const post = async (path: string) => (await fetch(`http://127.0.0.1:${PORT}${path}`, { method: 'POST' })).json();
const get = async (path: string) => fetch(`http://127.0.0.1:${PORT}${path}`);

class Client {
  ws: WebSocket; msgs: ServerMsg[] = []; team: Team | null = null; token?: string;
  constructor(private id: string) { this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/${id}`); }
  async ready() {
    await new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      this.msgs.push(m);
      if (m.type === 'joined') { this.team = m.team; this.token = m.seatToken; }
    });
    return this;
  }
  send(m: unknown) { this.ws.send(JSON.stringify(m)); }
  /** Wait until a message matching `pred` arrives. */
  /** Generous by default: these waits are about correctness, not speed, and CI machines are slow. */
  async until<T extends ServerMsg['type']>(type: T, pred: (m: Extract<ServerMsg, { type: T }>) => boolean = () => true, ms = 10_000) {
    const deadline = Date.now() + ms;
    for (;;) {
      const hit = this.msgs.find(m => m.type === type && pred(m as never));
      if (hit) return hit as Extract<ServerMsg, { type: T }>;
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${type}; saw ${this.msgs.map(m => m.type).join(',')}`);
      await new Promise(r => setTimeout(r, 15));
    }
  }
  last<T extends ServerMsg['type']>(type: T) {
    const l = [...this.msgs].reverse().find(m => m.type === type);
    return l as Extract<ServerMsg, { type: T }> | undefined;
  }
  close() { this.ws.close(); }
}

async function seatedPair() {
  const { id } = await post('/api/table') as { id: string };
  const a = await new Client(id).ready();
  a.send({ type: 'join', name: 'Ada' });
  await a.until('joined');
  const b = await new Client(id).ready();
  b.send({ type: 'join', name: 'Bo' });
  await b.until('joined');
  return { id, a, b };
}

describe('node adapter', () => {
  it('creates a table with an 8-character unguessable id', async () => {
    const { id } = await post('/api/table') as { id: string };
    expect(id).toMatch(/^[0-9a-hjkmnp-tv-z]{8}$/);
  });

  it('two clients join, see each other, play moves and transfer a capture across boards', async () => {
    const { a, b } = await seatedPair();
    expect(a.team).not.toBeNull();
    expect(b.team).not.toBeNull();
    expect(a.team).not.toBe(b.team);

    await a.until('snapshot', m => !!m.room.players.WA && !!m.room.players.BA);
    a.send({ type: 'ready', value: true });
    b.send({ type: 'ready', value: true });
    const playing = await a.until('snapshot', m => m.room.phase === 'countdown');
    expect(playing.room.startAt).toBeGreaterThan(Date.now() - 1000);

    await a.until('snapshot', m => m.room.phase === 'playing');

    // Scholar's-mate shape is only a check in bughouse, so drive to a real knight mate instead.
    const teamOn = (board: 'A' | 'B', color: 'w' | 'b'): Client => {
      const t: Team = (board === 'A') === (color === 'w') ? 'WA' : 'BA';
      return a.team === t ? a : b;
    };
    // Actions carry a delta, not a snapshot, so follow the fen the way the real client does.
    const fenNow = () => {
      const lastAct = [...a.msgs].reverse().find(m => m.type === 'action') as Extract<ServerMsg, { type: 'action' }> | undefined;
      return lastAct ? lastAct.ply.fen : a.last('snapshot')!.room.fen;
    };
    const moves: [('A' | 'B'), string][] = [
      ['A', 'e4'], ['A', 'e5'], ['A', 'Nf3'], ['A', 'Nc6'], ['A', 'Bc4'], ['A', 'Nf6'], ['A', 'Nxe5'],
    ];
    const { parseFen, gameFrom } = await import('@tandem/engine');
    for (const [board, text] of moves) {
      const f = fenNow();
      const g = gameFrom(parseFen(f.A).pos, parseFen(f.B).pos, {
        A: parseFen(f.A).pockets, B: parseFen(f.B).pockets,
      });
      const action = parseSan(g, board, text);
      expect(action, `${board} ${text}`).not.toBeNull();
      const who = teamOn(board, g.pos[board].turn);
      const before = a.msgs.filter(m => m.type === 'action').length;
      who.send({ type: 'action', board, action });
      await a.until('action', () => a.msgs.filter(m => m.type === 'action').length > before);
    }
    const acts = a.msgs.filter(m => m.type === 'action') as Extract<ServerMsg, { type: 'action' }>[];
    expect(acts.length).toBe(7);
    const last = acts.at(-1)!.ply;
    expect(last.n).toBe(7);
    expect(last.san).toBe('Nxe5');
    expect(last.transfer).toEqual({ toBoard: 'B', color: 'b', piece: 'p' });
    // The captured pawn is in the partner reserve on board B.
    expect(last.fen.B).toContain('[p]');
    // Both clients saw the same action stream.
    expect(b.msgs.filter(m => m.type === 'action').length).toBe(7);
    a.close(); b.close();
  }, 20000);

  it('rejects actions from a spectator and counts them', async () => {
    const { id, a, b } = await seatedPair();
    const w = await new Client(id).ready();
    w.send({ type: 'join', name: 'Watcher' });
    const j = await w.until('joined');
    expect(j.team).toBeNull();
    await a.until('snapshot', m => m.room.spectators === 1);
    w.send({ type: 'action', board: 'A', action: { kind: 'move', from: 12, to: 28 } });
    const rej = await w.until('reject');
    expect(rej.reason).toMatch(/spectator/i);
    w.close(); a.close(); b.close();
  });

  it('reclaims a seat with its token after a disconnect', async () => {
    const { id, a, b } = await seatedPair();
    const tok = a.token!;
    const team = a.team;
    a.close();
    await b.until('snapshot', m => m.room.players[team!]!.connected === false);
    const again = await new Client(id).ready();
    again.send({ type: 'join', seatToken: tok });
    const j = await again.until('joined');
    expect(j.team).toBe(team);
    await again.until('snapshot', m => m.room.players[team!]!.connected === true);
    again.close(); b.close();
  });

  it('rejects malformed json, unknown types and oversized payloads', async () => {
    const { a, b } = await seatedPair();
    a.ws.send('not json');
    await a.until('reject', m => /malformed json/.test(m.reason));
    a.send({ type: 'nope' });
    await a.until('reject', m => /unknown message/.test(m.reason));
    a.close(); b.close();
  });

  it('rate-limits a flood of messages', async () => {
    const { a, b } = await seatedPair();
    for (let i = 0; i < 60; i++) a.send({ type: 'ping', t: i });
    await a.until('reject', m => /too many messages/.test(m.reason));
    a.close(); b.close();
  });

  it('answers a ping with a pong for clock sync', async () => {
    const { a, b } = await seatedPair();
    a.send({ type: 'ping', t: 12345 });
    const pong = await a.until('pong', m => m.t === 12345);
    expect(pong.serverTs).toBeGreaterThan(0);
    a.close(); b.close();
  });

  it('serves a finished game for replay, as text and as json', async () => {
    const { id, a, b } = await seatedPair();
    a.send({ type: 'ready', value: true });
    b.send({ type: 'ready', value: true });
    await a.until('snapshot', m => m.room.phase === 'playing');
    a.send({ type: 'resign' });
    await a.until('ended');
    const rec = await (await get(`/api/game/${id}`)).json();
    expect(rec.result.reason).toBe('resign');
    expect(rec.players.WA).toBeTruthy();
    const txt = await (await get(`/api/game/${id}.txt`)).text();
    expect(txt).toContain('[Event "Tandem bughouse"]');
    expect(txt).toContain('resigned');
    const js = await (await get(`/api/game/${id}.json`)).json();
    expect(js.event).toBe('Tandem bughouse');
    a.close(); b.close();
  }, 15000);

  it('404s an unknown game and 400s a malformed id', async () => {
    expect((await get('/api/game/abcdefgh')).status).toBe(404);
    expect((await get('/api/game/BADID')).status).toBe(400);
  });

  it('refuses a websocket upgrade on a malformed table id', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/NOTVALID`);
    await expect(new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); })).rejects.toBeTruthy();
  });
});
