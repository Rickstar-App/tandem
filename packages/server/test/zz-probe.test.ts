import { describe, expect, it } from 'vitest';
import { parseSan } from '@tandem/engine';
import { Room, CLAIM_AFTER_MS, COUNTDOWN_MS } from '../src/room.ts';
import { Hub } from '../src/hub.ts';
import type { Team } from '../src/types.ts';
const T0 = 1_700_000_000_000;
let n = 0;
const deps = { newToken: () => `tok${++n}`, rnd: () => 0.25 };
function table(tc = { baseMin: 5, incSec: 0 }) {
  const r = new Room('tbl1', deps, T0);
  const host = r.join({ type: 'join', name: 'Host' }, T0);
  r.setup(host.team!, { type: 'setup', tc }, T0);
  r.join({ type: 'join', name: 'Guest' }, T0);
  return r;
}
function start(r: Room, at = T0) { r.setReady('WA', true, at); r.setReady('BA', true, at); r.tick(at + COUNTDOWN_MS); return at + COUNTDOWN_MS; }
function play(r: Room, board: 'A'|'B', text: string, now: number, rtt = 0) {
  const a = parseSan(r.game, board, text)!;
  const color = r.game.pos[board].turn;
  const team: Team = (board === 'A') === (color === 'w') ? 'WA' : 'BA';
  return r.act(team, board, { type: 'action', board, action: a as never }, now, rtt);
}
describe('probes3', () => {
  it('A: nextDeadline sits in the past once the claim window has opened', () => {
    const r = table({ baseMin: 30, incSec: 0 });
    const t = start(r);
    play(r, 'A', 'e4', t + 1_000);          // past the abort window
    r.leave('WA', t + 2_000);               // WA drops
    const now = t + 2_000 + CLAIM_AFTER_MS + 3_000;
    r.tick(now);
    const d = r.nextDeadline();
    console.log('PROBE A phase=', r.phase, 'deadline - now =', d! - now);
    expect(r.phase).toBe('playing');
    expect(d! - now).toBeLessThan(0);
  });
  it('A2: the node setTimer path turns that into a 0 ms busy loop', async () => {
    let fires = 0; let lastMs = -1; let now = T0;
    let timer: any = null;
    const hub = new Hub('tbl1', {
      now: () => now,
      newToken: () => `k${++n}`,
      setTimer: (at) => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (at === null) return;
        const ms = Math.max(0, at - now);      // exactly node-main.ts
        lastMs = ms;
        if (fires++ < 5) timer = setTimeout(() => hub.wake(), 0);
      },
    });
    const r = hub.room;
    r.join({ type: 'join', name: 'H' }, now); r.join({ type: 'join', name: 'G' }, now);
    const c = hub.open({ send: () => {}, close: () => {} });
    hub.message(c, JSON.stringify({ type: 'join', name: 'H', seatToken: r.players.WA!.token }));
    r.setReady('WA', true, now); r.setReady('BA', true, now);
    now += COUNTDOWN_MS; r.tick(now);
    play(r, 'A', 'e4', now + 1_000); now += 1_000;
    r.leave('WA', now);
    now += CLAIM_AFTER_MS + 3_000;
    hub.wake();
    await new Promise(res => setTimeout(res, 30));
    console.log('PROBE A2 scheduled delay ms =', lastMs, 'wakes =', fires, 'phase =', r.phase);
    expect(lastMs).toBe(0);
    expect(fires).toBeGreaterThan(3);
  });
});
