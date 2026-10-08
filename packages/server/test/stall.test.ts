import { describe, expect, it } from 'vitest';
import { parseFen, parseSan } from '@tandem/engine';
import { Room, COUNTDOWN_MS } from '../src/room.ts';
import type { Team } from '../src/types.ts';

const T0 = 1_700_000_000_000;
let n = 0;
const deps = { newToken: () => `t${++n}`, rnd: () => 0.25 };

function table(tc = { baseMin: 1, incSec: 0 }) {
  const r = new Room('stall', deps, T0);
  const h = r.join({ type: 'join', name: 'X' }, T0);
  r.setup(h.team!, { type: 'setup', tc }, T0);
  r.join({ type: 'join', name: 'Y' }, T0);
  r.setReady('WA', true, T0); r.setReady('BA', true, T0);
  r.tick(T0 + COUNTDOWN_MS);
  return r;
}
function setBoard(r: Room, board: 'A' | 'B', fen: string) {
  const { pos, pockets } = parseFen(fen);
  r.game.pos[board] = pos;
  r.game.reserve[board] = pockets;
}
function play(r: Room, board: 'A' | 'B', text: string, now: number) {
  const a = parseSan(r.game, board, text);
  if (!a) throw new Error(`illegal: ${board} ${text}`);
  const color = r.game.pos[board].turn;
  const team: Team = (board === 'A') === (color === 'w') ? 'WA' : 'BA';
  const out = r.act(team, board, { type: 'action', board, action: a as never }, now);
  if (!out.ok) throw new Error(out.reason);
  return out;
}

/** Black is checked along rank 8 with a gap. Its pawns move away from the blocking
 *  squares, so no promotion saves it, and the reserve is empty: pending, per §3.4. */
const PENDING_A = 'R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1';

/**
 * Raised by the strategic review: a reachable state in which the correct play is to
 * make no play. The side that is pending on board A can only obtain a blocking piece
 * by capturing on board B, which needs its turn there. If the opponent holds the move
 * on B and declines to use it, neither position can change again, and the game is
 * settled purely by which of the two running clocks was further ahead.
 */
describe('the pending stall race (BRIEF 3.4, 3.5, 3.9)', () => {
  it('is reachable, and the pending side has no legal action on either board', () => {
    const r = table();
    const t = T0 + COUNTDOWN_MS;

    play(r, 'B', 'e4', t + 100);              // a real move, so the abort rule no longer applies
    setBoard(r, 'A', PENDING_A);              // board A reaches the pending state
    expect(r.snapshot(t + 100).status.A).toBe('pending');

    // The pending seat is A-b, held by team BA, and its clock is running.
    expect(r.running()).toContain('A-b');
    // Board B is now team WA's move, so BA cannot act there either.
    expect(r.game.pos.B.turn).toBe('b');
    expect(r.act('BA', 'B', { type: 'action', board: 'B', action: { kind: 'move', from: 12, to: 28 } }, t + 200).ok)
      .toBe(false);

    // Team WA simply never moves. Nothing in the rules compels it to, and the
    // abort rule only covers a game where nothing has been played at all.
    r.tick(t + 40_000);
    expect(r.phase, 'no rule ends a stalled game early').toBe('playing');
    expect(r.ply.length, 'the position has not changed since the stall began').toBe(1);
  });

  it('is settled by banked time alone, with no further move played', () => {
    const r = table();
    const t = T0 + COUNTDOWN_MS;

    // BA moves on B straight away, handing board B to WA.
    play(r, 'B', 'e4', t + 100);
    // WA then sits on board B for fifteen seconds, burning only its own B clock.
    r.tick(t + 15_000);
    // Board A now reaches the pending state, so BA's A clock starts running too.
    setBoard(r, 'A', PENDING_A);

    const c = r.snapshot(t + 15_000).clocks;
    expect(c['B-b'], 'WA already spent time on board B').toBeLessThan(c['A-b']);

    // Neither side can or will move again. WA holds the shorter running clock
    // (it started burning at t+100; BA's only started at t+15,000), so WA flags
    // first and loses, with board A untouched by either player.
    r.tick(t + 61_000);
    expect(r.phase).toBe('over');
    expect(r.result!.reason).toBe('flag');
    expect(r.result!.winner, 'the side that banked more time wins by waiting').toBe('BA');
    expect(r.ply.length, 'one move in the whole game').toBe(1);
  });
});
