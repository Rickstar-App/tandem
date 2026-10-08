// Cloudflare Workers + Durable Objects adapter (BRIEF §6.1). One object per game: the object
// serialises every event, holds the sockets, and uses alarms for flag timeouts.

import { Hub } from './hub.ts';
import { isTableId, seatToken, tableId, webRng } from './ids.ts';
import { toJson, toText } from './export.ts';
import type { GameRecord, GameStore } from './store.ts';

interface D1Result<T> { results: T[] }
interface D1Stmt { bind(...a: unknown[]): D1Stmt; run(): Promise<unknown>; all<T>(): Promise<D1Result<T>> }
interface D1Database { prepare(q: string): D1Stmt }
interface DurableObjectState {
  storage: { setAlarm(t: number): Promise<void>; deleteAlarm(): Promise<void> };
  acceptWebSocket?(ws: WebSocket, tags?: string[]): void;
}
export interface Env { TANDEM_ROOM: DurableObjectNamespace; DB?: D1Database; ASSETS?: { fetch(r: Request): Promise<Response> } }
interface DurableObjectNamespace { idFromName(n: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } }

/** D1-backed store for finished games, with the 90-day retention the brief sets. */
export class D1Store implements GameStore {
  constructor(private db: D1Database) {}
  async put(rec: GameRecord): Promise<void> {
    await this.db.prepare('INSERT OR REPLACE INTO games (id, ended_at, body) VALUES (?, ?, ?)')
      .bind(rec.id, rec.endedAt, JSON.stringify(rec)).run();
    await this.db.prepare('DELETE FROM games WHERE ended_at < ?')
      .bind(Date.now() - 90 * 24 * 60 * 60 * 1000).run();
  }
  async get(id: string): Promise<GameRecord | null> {
    const r = await this.db.prepare('SELECT body FROM games WHERE id = ?').bind(id).all<{ body: string }>();
    const row = r.results[0];
    return row ? JSON.parse(row.body) as GameRecord : null;
  }
}

/** Kept in sync with migrations/0001_games.sql, which is what `wrangler d1 migrations apply` runs. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id       TEXT PRIMARY KEY,
  ended_at INTEGER NOT NULL,
  body     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS games_ended_at ON games (ended_at);
`;

export class TandemRoom {
  private hub: Hub | null = null;
  private socks = new Map<WebSocket, ReturnType<Hub['open']>>();
  constructor(private state: DurableObjectState, private env: Env) {}

  private getHub(id: string): Hub {
    if (!this.hub) {
      this.hub = new Hub(id, {
        now: () => Date.now(),
        newToken: () => seatToken(webRng),
        store: this.env.DB ? new D1Store(this.env.DB) : undefined,
        setTimer: (at) => {
          if (at === null) void this.state.storage.deleteAlarm();
          else void this.state.storage.setAlarm(at);
        },
      });
    }
    return this.hub;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') ?? '';
    if (!isTableId(id)) return new Response('bad id', { status: 400 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, CfWebSocket];
    server.accept();
    const hub = this.getHub(id);
    const conn = hub.open({
      send: (d) => { try { server.send(d); } catch { /* closed */ } },
      close: (code, reason) => { try { server.close(code, reason); } catch { /* closed */ } },
    });
    this.socks.set(server, conn);
    server.addEventListener('message', (ev: MessageEvent) => {
      const text = typeof ev.data === 'string' ? ev.data : '';
      if (!text || text.length > 4096) { server.close(4009, 'message too large'); return; }
      hub.message(conn, text);
    });
    const bye = () => { const c = this.socks.get(server); if (c) { hub.close(c); this.socks.delete(server); } };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client } as CfResponseInit);
  }

  async alarm(): Promise<void> { this.hub?.wake(); }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    const json = (code: number, body: unknown) =>
      new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json; charset=utf-8' } });

    if (p === '/api/table' && req.method === 'POST') return json(200, { id: tableId(webRng) });

    const ws = /^\/ws\/([^/]+)$/.exec(p);
    if (ws) {
      if (!isTableId(ws[1]!)) return new Response('bad id', { status: 400 });
      const stub = env.TANDEM_ROOM.get(env.TANDEM_ROOM.idFromName(ws[1]!));
      return stub.fetch(new Request(`https://room/?id=${ws[1]}`, req));
    }

    const game = /^\/api\/game\/([^/.]+)(?:\.(txt|json))?$/.exec(p);
    if (game && req.method === 'GET') {
      if (!isTableId(game[1]!)) return json(400, { error: 'bad id' });
      if (!env.DB) return json(503, { error: 'replay storage is not configured' });
      const rec = await new D1Store(env.DB).get(game[1]!);
      if (!rec) return json(404, { error: 'no such finished game' });
      if (game[2] === 'txt') return new Response(toText(rec), { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="tandem-${rec.id}.txt"` } });
      if (game[2] === 'json') return new Response(toJson(rec), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="tandem-${rec.id}.json"` } });
      return json(200, rec);
    }
    if (p === '/api/health') return json(200, { ok: true });

    // Everything else is the SPA; ASSETS serves the built client with a single-page fallback.
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('not found', { status: 404 });
  },
};

// Workers runtime APIs that the DOM lib does not describe. Declared here rather than pulling in
// @cloudflare/workers-types, which would add a dependency for two type shapes.
declare class WebSocketPair { constructor(); }
/** The server half of a WebSocketPair must be accepted before use. */
interface CfWebSocket extends WebSocket { accept(): void }
interface CfResponseInit extends ResponseInit { webSocket?: WebSocket }
