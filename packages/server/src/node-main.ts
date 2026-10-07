// Node + ws adapter: local development, Playwright end-to-end runs, and the BRIEF §6.1 fallback host.
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { randomFillSync } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Hub } from './hub.ts';
import { isTableId, seatToken, tableId } from './ids.ts';
import { MemoryStore } from './store.ts';
import { toJson, toText } from './export.ts';

const rng = (b: Uint8Array) => { randomFillSync(b); };
const store = new MemoryStore();
const hubs = new Map<string, { hub: Hub; timer: NodeJS.Timeout | null }>();

function getHub(id: string): Hub {
  const found = hubs.get(id);
  if (found) return found.hub;
  const entry: { hub: Hub; timer: NodeJS.Timeout | null } = { hub: null as unknown as Hub, timer: null };
  entry.hub = new Hub(id, {
    now: () => Date.now(),
    newToken: () => seatToken(rng),
    store,
    setTimer: (at) => {
      if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
      if (at === null) { if (process.env.TANDEM_DEBUG) console.log(`[timer] ${id} cleared phase=${entry.hub.room.phase}`); return; }
      const ms = Math.max(0, at - Date.now());
      if (process.env.TANDEM_DEBUG) console.log(`[timer] ${id} in ${ms}ms phase=${entry.hub.room.phase}`);
      entry.timer = setTimeout(() => {
        entry.timer = null;
        if (process.env.TANDEM_DEBUG) console.log(`[fire] ${id} phase=${entry.hub.room.phase}`);
        entry.hub.wake();
        if (process.env.TANDEM_DEBUG) console.log(`[woke] ${id} phase=${entry.hub.room.phase}`);
      }, ms);
    },
  });
  hubs.set(id, entry);
  return entry.hub;
}

// Drop idle, unjoined tables so a long-running process does not accumulate them.
setInterval(() => {
  const now = Date.now();
  for (const [id, e] of hubs) {
    if (e.hub.connectionCount === 0 && e.hub.room.isExpired(now)) {
      if (e.timer) clearTimeout(e.timer);
      hubs.delete(id);
    }
  }
}, 60_000).unref?.();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const WEB_ROOT = process.env.TANDEM_WEB_ROOT
  ? resolve(process.env.TANDEM_WEB_ROOT)
  : resolve(new URL('../../web/dist', import.meta.url).pathname);

function json(res: ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string): Promise<boolean> {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const file = join(WEB_ROOT, rel);
  if (!file.startsWith(WEB_ROOT)) { res.writeHead(403).end('forbidden'); return true; }
  try {
    const st = await stat(file);
    if (st.isDirectory()) return false;
    const body = await readFile(file);
    const mime = MIME[extname(file)] ?? 'application/octet-stream';
    const immutable = rel.includes('/assets/') || rel.endsWith('.woff2');
    res.writeHead(200, { 'content-type': mime, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(body);
    return true;
  } catch { return false; }
}

async function serveIndex(res: ServerResponse) {
  try {
    const body = await readFile(join(WEB_ROOT, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('The client is not built yet. Run: npm run build -w @tandem/web');
  }
}

export function createApp(port: number) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const p = url.pathname;

    if (p === '/api/table' && req.method === 'POST') {
      let id = tableId(rng);
      while (hubs.has(id)) id = tableId(rng);
      getHub(id);
      return json(res, 200, { id });
    }
    const game = /^\/api\/game\/([^/.]+)(?:\.(txt|json))?$/.exec(p);
    if (game && req.method === 'GET') {
      const id = game[1]!;
      if (!isTableId(id)) return json(res, 400, { error: 'bad id' });
      const rec = await store.get(id);
      if (!rec) return json(res, 404, { error: 'no such finished game' });
      if (game[2] === 'txt') {
        const body = toText(rec);
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="tandem-${id}.txt"` });
        return void res.end(body);
      }
      if (game[2] === 'json') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="tandem-${id}.json"` });
        return void res.end(toJson(rec));
      }
      return json(res, 200, rec);
    }
    if (p === '/api/health') return json(res, 200, { ok: true, tables: hubs.size });

    if (req.method !== 'GET') { res.writeHead(405).end('method not allowed'); return; }
    if (await serveStatic(req, res, p)) return;
    await serveIndex(res); // SPA fallback for /t/:id, /g/:id, /watch/:id, /rules
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const m = /^\/ws\/([^/]+)$/.exec(url.pathname);
    if (!m || !isTableId(m[1]!)) { socket.destroy(); return; }
    const id = m[1]!;
    wss.handleUpgrade(req, socket, head, (ws) => {
      const hub = getHub(id);
      const conn = hub.open({
        send: (d) => { if (ws.readyState === WebSocket.OPEN) ws.send(d); },
        close: (code, reason) => ws.close(code, reason),
      });
      ws.on('message', (data) => {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        if (text.length > 4096) { hub.close(conn); ws.close(4009, 'message too large'); return; }
        hub.message(conn, text);
      });
      ws.on('close', () => hub.close(conn));
      ws.on('error', () => hub.close(conn));
    });
  });

  return {
    server,
    /** Resolves with the bound port; pass 0 to let the OS choose (tests). */
    listen: () => new Promise<number>(r => server.listen(port, () => r((server.address() as { port: number }).port))),
    close: () => new Promise<void>(r => {
      for (const c of wss.clients) c.terminate();
      wss.close();
      server.closeAllConnections?.();
      server.close(() => r());
    }) };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=\/packages)/, ''));
if (isMain || process.env.TANDEM_START === '1') {
  const port = Number(process.env.PORT ?? 8787);
  const app = createApp(port);
  app.listen().then(() => console.log(`Tandem server on http://localhost:${port}`));
}
