/**
 * Pre-deploy check for the Cloudflare adapter (BRIEF §6.1).
 *
 * The vitest suites cover the Node + `ws` host; this is the only thing that exercises
 * src/durable-object.ts, which can only fail at runtime inside workerd. It found two real bugs the
 * first time it ran: a string `export` that aborted worker startup, and an unguarded D1 read.
 *
 * Needs a worker on :8788 —  cd packages/server && npx wrangler dev --port 8788 --local
 * Migrations must be applied once —  npx wrangler d1 migrations apply tandem --local
 * Run with  npm run test:worker  (takes ~70s: the flag check waits out a real minute).
 */
import WebSocket from 'ws';

const BASE = process.env.WORKER_URL ?? 'http://localhost:8788';
const WS = BASE.replace(/^http/, 'ws');
const sq = (n) => (+n[1] - 1) * 8 + (n.charCodeAt(0) - 97);

let failures = 0;
const ok = (m) => console.log('  ok  ' + m);
const fail = (m) => { console.error('  FAIL  ' + m); failures++; };

async function newTable() {
  const r = await fetch(BASE + '/api/table', { method: 'POST' });
  if (!r.ok) throw new Error(`POST /api/table -> ${r.status}`);
  return (await r.json()).id;
}

function client(id) {
  const ws = new WebSocket(`${WS}/ws/${id}`);
  // `closed` is recorded so that a dropped socket reports itself as a dropped socket. Without it
  // every wait just times out, and a disconnect is indistinguishable from the server going quiet.
  const c = { ws, msgs: [], seqs: [], closed: null };
  ws.on('close', (code, reason) => { c.closed = `code=${code} reason="${reason}"`; });
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    c.msgs.push(m);
    if (typeof m.seq === 'number') c.seqs.push(m.seq);
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = (pred, ms = 8000) => new Promise((res, rej) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const h = c.msgs.find(pred);
      if (h) { clearInterval(iv); res(h); }
      else if (c.closed) {
        clearInterval(iv);
        rej(new Error(`socket closed while waiting (${c.closed})`));
      }
      else if (Date.now() - t0 > ms) {
        clearInterval(iv);
        rej(new Error(`timeout after ${ms}ms; last 3 = ${JSON.stringify(c.msgs.slice(-3))}`));
      }
    }, 40);
  });
  c.open = new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  return c;
}
const move = (c, board, from, to) =>
  c.send({ type: 'action', board, action: { kind: 'move', from: sq(from), to: sq(to) } });

async function seat(id, name, seatToken) {
  const c = client(id);
  await c.open;
  c.send({ type: 'join', name, ...(seatToken ? { seatToken } : {}) });
  const j = await c.wait((m) => m.type === 'joined');
  return { c, j };
}
async function startedGame(id, tc) {
  const { c: p1, j: j1 } = await seat(id, 'One');
  const { c: p2, j: j2 } = await seat(id, 'Two');
  p1.send({ type: 'setup', tc });
  p1.send({ type: 'ready', value: true });
  p2.send({ type: 'ready', value: true });
  await p1.wait((m) => m.type === 'snapshot' && m.room.phase === 'playing', 20000);
  const wa = j1.team === 'WA' ? p1 : p2;
  const ba = j1.team === 'WA' ? p2 : p1;
  return { p1, p2, j1, j2, wa, ba };
}

// ---- HTTP surface ---------------------------------------------------------
console.log('HTTP routes');
{
  const h = await fetch(BASE + '/api/health');
  (h.ok && (await h.json()).ok) ? ok('/api/health') : fail('/api/health');

  const spa = await fetch(BASE + '/t/abcdefgh');
  (spa.ok && /text\/html/.test(spa.headers.get('content-type') ?? ''))
    ? ok('SPA fallback serves html on a deep link') : fail('SPA fallback');

  const bad = await fetch(BASE + '/api/game/NOTANID');
  bad.status === 400 ? ok('a malformed id is rejected with 400') : fail(`bad id -> ${bad.status}`);

  // Must be a clean 404, not an uncaught D1 throw leaking a stack trace.
  const unknown = await fetch(BASE + '/api/game/aaaaaaaa');
  const body = await unknown.text();
  if (unknown.status === 404 && !/\s+at\s/.test(body)) ok('an unknown game is a clean 404 with no stack trace');
  else fail(`unknown game -> ${unknown.status} ${body.slice(0, 120)}`);

  const noUpgrade = await fetch(BASE + '/ws/aaaaaaaa');
  noUpgrade.status === 426 ? ok('/ws without an Upgrade header is 426') : fail(`/ws -> ${noUpgrade.status}`);
}

// ---- a game through the Durable Object ------------------------------------
console.log('a game through the Durable Object');
const id = await newTable();
{
  const { p1, p2, j1, j2, wa, ba } = await startedGame(id, { baseMin: 5, incSec: 0 });
  ok('both sockets upgraded and were seated');
  (j1.team && j2.team && j1.team !== j2.team) ? ok(`distinct teams (${j1.team}/${j2.team})`) : fail('teams not distinct');
  j1.seatToken ? ok('a seat token was issued') : fail('no seat token');

  move(wa, 'A', 'e2', 'e4');
  await p2.wait((m) => m.type === 'action' && m.ply.san === 'e4');
  ok('a move on board A reaches the other player');

  move(ba, 'A', 'd7', 'd5');
  await p1.wait((m) => m.type === 'action' && m.ply.san === 'd5');
  move(wa, 'A', 'e4', 'd5');
  await p1.wait((m) => m.type === 'action' && m.ply.san?.includes('xd5'));
  ok('a capture is broadcast');

  p1.send({ type: 'resync' });
  const snap = await p1.wait((m) => m.type === 'snapshot' && m.room.ply.length >= 3);
  const pocket = (fen) => (fen.match(/\[([^\]]*)\]/) ?? [, ''])[1];
  pocket(snap.room.fen.B).includes('p')
    ? ok('the captured pawn arrives in the partner board reserve')
    : fail(`no transfer: A="${pocket(snap.room.fen.A)}" B="${pocket(snap.room.fen.B)}"`);

  // Per-connection messages must not consume broadcast seq numbers, or clients resync in a storm.
  const gaps = p2.seqs.filter((v, i) => i > 0 && v !== p2.seqs[i - 1] + 1);
  gaps.length ? fail(`seq gaps: ${JSON.stringify(p2.seqs)}`) : ok(`broadcast seq contiguous over ${p2.seqs.length}`);

  const { j: rj } = await seat(id, 'One', j1.seatToken);
  rj.team === j1.team ? ok('a seat is reclaimed by token after reconnect') : fail(`reclaim gave ${rj.team}`);

  p1.send({ type: 'ping', t: 1234 });
  // The server also *sends* {type:'pong', t:now} as its own RTT probe, so match on our own t.
  const pong = await p1.wait((m) => m.type === 'pong' && m.t === 1234);
  typeof pong.serverTs === 'number' ? ok('ping/pong round trip') : fail('pong malformed');

  p1.ws.close(); p2.ws.close();
}

// ---- the alarm ------------------------------------------------------------
// The only Cloudflare-specific mechanism left: storage.setAlarm -> alarm() -> hub.wake().
// A 1+0 game must end on its own with no client input. One move first, because a game with no
// moves aborts at 30s (room.ts, ABORT_MS) and would prove the alarm but not the flag.
console.log('the Durable Object alarm');
{
  const id2 = await newTable();
  const { p1, wa } = await startedGame(id2, { baseMin: 1, incSec: 0 });
  move(wa, 'A', 'e2', 'e4');
  await p1.wait((m) => m.type === 'action' && m.ply.san === 'e4');
  const t0 = Date.now();
  console.log('      idling for up to 95s; nothing is sent from here on');
  try {
    const end = await p1.wait((m) => m.type === 'ended', 95000);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (end.result.reason === 'flag') ok(`a clock flagged after ${secs}s with no client input: ${end.result.text}`);
    else fail(`ended for the wrong reason: ${end.result.reason} (${end.result.text})`);
  } catch (e) {
    fail(`no game end within 95s: ${e.message}`);
  }
  p1.ws.close();
}

await new Promise((r) => setTimeout(r, 300));
console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall worker checks passed');
process.exit(failures ? 1 : 0);
