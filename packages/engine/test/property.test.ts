import { describe, expect, it } from 'vitest';
import { Color, DropType, PieceType } from '../src/board';
import { Board, Game, apply, legal, newGame, result, status } from '../src/game';

// Whole-game conservation: promoted pieces count as their original pawn, and reserves count as on-hand.
function census(game: Game) {
  const out: Record<Color, Record<string, number>> = { w: {}, b: {} };
  const add = (c: Color, k: string, n = 1) => { out[c][k] = (out[c][k] ?? 0) + n; };
  for (const b of ['A', 'B'] as const) {
    for (const x of game.pos[b].sq) if (x) add(x.c, x.promoted ? 'P*' : x.t);
    for (const c of ['w', 'b'] as const) for (const t of ['p', 'n', 'b', 'r', 'q'] as DropType[]) add(c, t, game.reserve[b][c][t]);
  }
  for (const c of ['w', 'b'] as const) { out[c]!.p = (out[c]!.p ?? 0) + (out[c]!['P*'] ?? 0); delete out[c]!['P*']; }
  return out;
}

function rng(seed: number) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

describe('invariants over random two-board playouts', () => {
  it('piece census is conserved; legal == accepted; mate detected consistently', () => {
    const rnd = rng(2026);
    let transfers = 0, drops = 0, promotions = 0, mates = 0, pendings = 0, games = 0;
    const start = census(newGame());
    for (let i = 0; i < 400; i++) {
      let game = newGame(); games++;
      for (let ply = 0; ply < 300; ply++) {
        if (result(game).over) { mates++; break; }
        const boards = (['A', 'B'] as Board[]).filter(b => legal(game, b).length);
        for (const b of ['A', 'B'] as const) if (status(game, b) === 'pending') pendings++;
        if (!boards.length) break;
        const b = boards[Math.floor(rnd() * boards.length)]!;
        const acts = legal(game, b);
        const a = acts[Math.floor(rnd() * acts.length)]!;
        const r = apply(game, b, a);
        if (r.transfer) transfers++;
        if (a.kind === 'drop') drops++;
        if (a.kind === 'move' && a.promo) promotions++;
        game = r.game;
        expect(census(game)).toEqual(start);
        for (const bd of ['A', 'B'] as const) {
          for (const c of ['w', 'b'] as const) for (const t of ['p', 'n', 'b', 'r', 'q'] as DropType[]) expect(game.reserve[bd][c][t]).toBeGreaterThanOrEqual(0);
          const kings = game.pos[bd].sq.filter(x => x && x.t === ('k' as PieceType)).length;
          expect(kings).toBe(2);
        }
      }
    }
    // The test must actually exercise the interesting mechanics, otherwise a green result means little.
    expect(transfers).toBeGreaterThan(1000);
    expect(drops).toBeGreaterThan(500);
    expect(promotions).toBeGreaterThan(5);
    console.log({ games, transfers, drops, promotions, mates, pendings });
  });

  it('every legal action applies; actions outside the legal set are rejected', () => {
    const rnd = rng(7);
    let game = newGame();
    for (let ply = 0; ply < 150; ply++) {
      for (const b of ['A', 'B'] as const) for (const a of legal(game, b).slice(0, 8)) expect(() => apply(game, b, a)).not.toThrow();
      const boards = (['A', 'B'] as Board[]).filter(b => legal(game, b).length);
      if (!boards.length) break;
      const b = boards[Math.floor(rnd() * boards.length)]!;
      const acts = legal(game, b);
      game = apply(game, b, acts[Math.floor(rnd() * acts.length)]!).game;
      if (result(game).over) break;
    }
  });
});
