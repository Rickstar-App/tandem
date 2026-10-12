// Regression: an already-open claim window must not be proposed as a deadline.
//
// `nextDeadline` used to offer `disconnectedSince + CLAIM_AFTER_MS` unconditionally. Reaching that
// moment only flips `claimable`, so applying it never removed it from the list: the host scheduled
// `max(0, at - now)` = 0, woke immediately, and was handed the same past moment again, spinning for
// as long as the player stayed disconnected. On Durable Object alarms every spin is also billable.
import { describe, expect, it } from 'vitest';
import { parseSan } from '@tandem/engine';
import { Room, CLAIM_AFTER_MS, COUNTDOWN_MS } from '../src/room.ts';
import { Hub } from '../src/hub.ts';
import type { Team } from '../src/types.ts';

const T0 = 1_700_000_000_000;
let n = 0;
const deps = { newToken: () => `tok${++n}`, rnd: () => 0.25 };

function table(tc = { baseMin: 30, incSec: 0 }) {
  const r = new Room('tbl1', deps, T0);
  const host = r.join({ type: 'join', name: 'Host' }, T0);
  r.setup(host.team!, { type: 'setup', tc }, T0);
  r.join({ type: 'join', name: 'Guest' }, T0);
  r.setReady('WA', true, T0);
  r.setReady('BA', true, T0);
  r.tick(T0 + COUNTDOWN_MS);
  return { r, t: T0 + COUNTDOWN_MS };
}
function play(r: Room, board: 'A' | 'B', text: string, now: number) {
  const a = parseSan(r.game, board, text)!;
  const color = r.game.pos[board].turn;
  const team: Team = (board === 'A') === (color === 'w') ? 'WA' : 'BA';
  return r.act(team, board, { type: 'action', board, action: a as never }, now, 0);
}

describe('the claim window as a deadline', () => {
  it('is proposed while it is still ahead', () => {
    const { r, t } = table();
    play(r, 'A', 'e4', t + 1_000);          // past the abort window
    r.leave('WA', t + 2_000);
    const now = t + 2_000 + 10_000;         // 10s into a 60s window
    expect(r.nextDeadline(now)).toBe(t + 2_000 + CLAIM_AFTER_MS);
  });

  it('is dropped once it has passed, and never returns a moment in the past', () => {
    const { r, t } = table();
    play(r, 'A', 'e4', t + 1_000);
    r.leave('WA', t + 2_000);
    const now = t + 2_000 + CLAIM_AFTER_MS + 3_000;
    r.tick(now);
    const d = r.nextDeadline(now);
    expect(r.phase).toBe('playing');
    expect(d).not.toBeNull();
    expect(d! - now).toBeGreaterThan(0);    // the earliest flag, not the spent claim window
  });

  it('still opens the claim window it stopped advertising', () => {
    const { r, t } = table();
    play(r, 'A', 'e4', t + 1_000);
    r.leave('WA', t + 2_000);
    const now = t + 2_000 + CLAIM_AFTER_MS + 3_000;
    r.tick(now);
    // Removing the deadline must not remove the feature: WA is the one who dropped, so BA claims.
    expect(r.claimable(now)).toEqual({ WA: false, BA: true });
  });

  it('does not make the host timer busy-loop', async () => {
    let fires = 0, lastMs = -1, now = T0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const hub = new Hub('tbl1', {
      now: () => now,
      newToken: () => `k${++n}`,
      setTimer: (at) => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (at === null) return;
        lastMs = Math.max(0, at - now);     // exactly what node-main.ts does
        // And it waits that long, as node-main.ts does. With the bug `lastMs` is 0, so this
        // re-enters immediately and the cap below is what stops the test hanging.
        if (fires++ < 20) timer = setTimeout(() => hub.wake(), lastMs);
      },
    });
    const r = hub.room;
    r.join({ type: 'join', name: 'H' }, now);
    r.join({ type: 'join', name: 'G' }, now);
    const c = hub.open({ send: () => {}, close: () => {} });
    hub.message(c, JSON.stringify({ type: 'join', name: 'H', seatToken: r.players.WA!.token }));
    r.setReady('WA', true, now);
    r.setReady('BA', true, now);
    now += COUNTDOWN_MS; r.tick(now);
    play(r, 'A', 'e4', now + 1_000); now += 1_000;
    r.leave('WA', now);
    now += CLAIM_AFTER_MS + 3_000;
    const before = fires;
    hub.wake();
    await new Promise(res => setTimeout(res, 40));
    expect(lastMs).toBeGreaterThan(0);      // a real delay, not an immediate re-entry
    expect(fires - before).toBeLessThan(3); // settles instead of spinning
  });
});
