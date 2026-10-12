// The host is woken by a Durable Object alarm, and every alarm is a billable request against a
// 100,000/day free allowance. A tab left open on a lobby or a result screen therefore has a real
// daily cost, and it only needs enough traffic to keep the socket alive — not the 5s round-trip
// samples a running game needs for lag compensation.
import { describe, expect, it } from 'vitest';
import { parseSan } from '@tandem/engine';
import { COUNTDOWN_MS, Room } from '../src/room.ts';
import { Hub, IDLE_PROBE_EVERY_MS, PROBE_EVERY_MS } from '../src/hub.ts';
import type { Team } from '../src/types.ts';

const T0 = 1_700_000_000_000;
let n = 0;

/** A hub with one connection, reporting the delay the host was last asked to wait. */
function harness() {
  let now = T0;
  let at: number | null = null;
  const hub = new Hub('tbl', {
    now: () => now,
    newToken: () => `tok${++n}`,
    rnd: () => 0.25,
    setTimer: (t) => { at = t; },
  });
  hub.open({ send: () => {}, close: () => {} });
  return {
    hub,
    room: hub.room,
    set now(v: number) { now = v; },
    get now() { return now; },
    /** ms the host was asked to wait, as node-main.ts and the alarm adapter both compute it. */
    get delay() { return at === null ? null : at - now; },
  };
}
function play(r: Room, board: 'A' | 'B', text: string, now: number) {
  const a = parseSan(r.game, board, text)!;
  const color = r.game.pos[board].turn;
  const team: Team = (board === 'A') === (color === 'w') ? 'WA' : 'BA';
  return r.act(team, board, { type: 'action', board, action: a as never }, now, 0);
}

describe('probe cadence', () => {
  it('is slow while a table sits in the lobby', () => {
    const h = harness();
    h.room.join({ type: 'join', name: 'Host' }, h.now);
    h.hub.wake();
    expect(h.room.phase).toBe('setup');
    expect(h.delay).toBe(IDLE_PROBE_EVERY_MS);
  });

  it('is fast while a game is running', () => {
    const h = harness();
    const host = h.room.join({ type: 'join', name: 'Host' }, h.now);
    h.room.setup(host.team!, { type: 'setup', tc: { baseMin: 30, incSec: 0 } }, h.now);
    h.room.join({ type: 'join', name: 'Guest' }, h.now);
    h.room.setReady('WA', true, h.now);
    h.room.setReady('BA', true, h.now);
    h.now = T0 + COUNTDOWN_MS;
    h.hub.wake();
    expect(h.room.phase).toBe('playing');
    expect(h.delay).toBe(PROBE_EVERY_MS);
  });

  it('is fast during the countdown, which is the transition a player waits on', () => {
    const h = harness();
    const host = h.room.join({ type: 'join', name: 'Host' }, h.now);
    h.room.setup(host.team!, { type: 'setup', tc: { baseMin: 30, incSec: 0 } }, h.now);
    h.room.join({ type: 'join', name: 'Guest' }, h.now);
    h.room.setReady('WA', true, h.now);
    h.room.setReady('BA', true, h.now);
    h.hub.wake();
    expect(h.room.phase).toBe('countdown');
    // The countdown's own deadline is nearer than either cadence, so that is what is scheduled.
    expect(h.delay).toBe(COUNTDOWN_MS);
    // What matters is the fallback behind it: a wake 5s later, not 30s later.
    h.now = T0 + COUNTDOWN_MS - 1;
    h.hub.wake();
    expect(h.delay).toBeLessThanOrEqual(PROBE_EVERY_MS);
  });

  it('goes slow again once the game is over', () => {
    const h = harness();
    const host = h.room.join({ type: 'join', name: 'Host' }, h.now);
    h.room.setup(host.team!, { type: 'setup', tc: { baseMin: 30, incSec: 0 } }, h.now);
    h.room.join({ type: 'join', name: 'Guest' }, h.now);
    h.room.setReady('WA', true, h.now);
    h.room.setReady('BA', true, h.now);
    h.now = T0 + COUNTDOWN_MS;
    h.hub.wake();
    play(h.room, 'A', 'e4', h.now);
    h.room.resign('BA', h.now);
    h.hub.wake();
    expect(h.room.phase).toBe('over');
    expect(h.delay).toBe(IDLE_PROBE_EVERY_MS);
  });

  it('keeps the idle cadence well under the free request allowance', () => {
    // 100,000 requests/day, and one alarm per wake per open table.
    const perDay = (ms: number) => (24 * 60 * 60 * 1000) / ms;
    expect(perDay(PROBE_EVERY_MS)).toBeGreaterThan(17_000);   // what it used to cost
    expect(perDay(IDLE_PROBE_EVERY_MS)).toBeLessThan(3_000);  // what an open tab costs now
  });
});
