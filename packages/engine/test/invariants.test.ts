// Independent oracles for the parts of BRIEF §3 that are easy to get subtly wrong:
// the mate / pending / stuck classification, and SAN uniqueness.

import { describe, expect, it } from 'vitest';
import {
  type DropType, type Pocket, type Position,
  attackers, canEverBlock, emptyPocket, findKing, legalActions, opp, parseSq as S,
} from '../src/board.ts';
import { type Board, type Game, apply, gameFrom, legal, newGame, result, status } from '../src/game.ts';
import { parseFen, toFen } from '../src/fen.ts';
import { legalWithSan } from '../src/notation.ts';

const KINGS = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const pk = (s: string): Pocket => { const p = emptyPocket(); for (const ch of s) p[ch as DropType]++; return p; };
const R = (o: { Aw?: string; Ab?: string } = {}) => ({
  A: { w: pk(o.Aw ?? ''), b: pk(o.Ab ?? '') },
  B: { w: emptyPocket(), b: emptyPocket() },
});
const g = (fenA: string, res?: ReturnType<typeof R>): Game =>
  gameFrom(parseFen(fenA).pos, parseFen(KINGS).pos, res);
const mv = (f: string, t: string, promo?: 'q' | 'r' | 'b' | 'n') =>
  ({ kind: 'move' as const, from: S(f), to: S(t), ...(promo ? { promo } : {}) });
const fenOf = (game: Game, b: Board) =>
  toFen(game.pos[b], { w: game.reserve[b].w, b: game.reserve[b].b });

/**
 * The meaning of "mate" in BRIEF §3.4, computed a completely different way: a side is mated
 * only if it could not act even with every piece type available to drop. If it could act with
 * some reserve, the check is pending, because the partner board can supply that piece.
 */
const couldActWithAnyReserve = (pos: Position, opts: Game['opts']): boolean =>
  legalActions(pos, { p: 2, n: 2, b: 2, r: 2, q: 2 }, opts).length > 0;

/** Hand-built positions that guarantee the oracle actually meets each state. */
const FIXED: [name: string, fenA: string, res: ReturnType<typeof R>, want: string][] = [
  ['smothered knight mate', '6rk/5Npp/8/8/8/8/8/4K3 b - - 0 1', R({ Ab: 'qqrr' }), 'mate'],
  ['contact queen mate', '7k/6Q1/8/8/8/8/1B6/4K3 b - - 0 1', R({ Ab: 'qrbnp' }), 'mate'],
  ['rook check with a gap', 'R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1', R(), 'pending'],
  ['rook check, pawn-only reserve', 'R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1', R({ Ab: 'p' }), 'pending'],
  ['no move, not in check', 'k7/8/1Q6/8/8/8/8/4K3 b - - 0 1', R(), 'stuck'],
];

describe('mate, pending and stuck agree with an independent oracle', () => {
  it('holds on hand-built positions covering every state', () => {
    const seen = new Set<string>();
    for (const [name, fen, res, want] of FIXED) {
      const game = g(fen, res);
      const st = status(game, 'A');
      expect(st, name).toBe(want);
      seen.add(st);
      const couldAct = couldActWithAnyReserve(game.pos.A, game.opts);
      // mate means no reserve could ever help; pending and stuck mean some reserve could.
      expect(couldAct, `${name}: oracle disagrees with status ${st}`).toBe(st !== 'mate');
    }
    expect([...seen].sort()).toEqual(['mate', 'pending', 'stuck']);
  });

  it('holds across random two-board playouts', () => {
    let seed = 4242;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let mates = 0, pendings = 0, stucks = 0;
    const wrong: string[] = [];

    for (let i = 0; i < 60 && !wrong.length; i++) {
      let game = newGame();
      for (let ply = 0; ply < 160; ply++) {
        for (const b of ['A', 'B'] as Board[]) {
          const st = status(game, b);
          const couldAct = couldActWithAnyReserve(game.pos[b], game.opts);
          if (st === 'mate') {
            mates++;
            if (couldAct) wrong.push(`mate, but a drop could answer it: ${b} ${fenOf(game, b)}`);
          } else if (st === 'pending') {
            pendings++;
            if (!couldAct) wrong.push(`pending, but no drop could ever answer it: ${b} ${fenOf(game, b)}`);
          } else if (st === 'stuck') {
            stucks++;
            if (!couldAct) wrong.push(`stuck, but no drop could ever free it: ${b} ${fenOf(game, b)}`);
          }
        }
        if (result(game).over) break;
        const boards = (['A', 'B'] as Board[]).filter(b => legal(game, b).length);
        if (!boards.length) break;
        const b = boards[Math.floor(rnd() * boards.length)]!;
        const acts = legal(game, b);
        game = apply(game, b, acts[Math.floor(rnd() * acts.length)]!).game;
      }
    }

    expect(wrong.slice(0, 3)).toEqual([]);
    // Breadth, not coverage: the fixed cases above guarantee each state is met at least once.
    expect(mates + pendings + stucks, 'playouts reached no terminal states at all').toBeGreaterThan(0);
  });
});

describe('canEverBlock, by attacker geometry', () => {
  // A check can be blocked only by a slider with at least one empty square before the king.
  const cases: [name: string, fen: string, blockable: boolean][] = [
    ['knight check', '7k/8/6N1/8/8/8/8/4K3 b - - 0 1', false],
    ['pawn check', '7k/6P1/8/8/8/8/8/4K3 b - - 0 1', false],
    ['contact rook', '7k/7R/8/8/8/8/8/4K3 b - - 0 1', false],
    ['contact queen on the diagonal', '7k/6Q1/8/8/8/8/8/4K3 b - - 0 1', false],
    ['rook down the file with a gap', '7k/8/8/8/8/8/8/4K2R b - - 0 1', true],
    ['bishop down the diagonal with a gap', '7k/8/8/8/8/2B5/8/4K3 b - - 0 1', true],
    ['double check', '7k/8/6N1/8/8/8/8/4K2R b - - 0 1', false],
    ['a promoted queen behaves like any queen', '7k/8/8/8/8/8/8/4K2Q~ b - - 0 1', true],
  ];
  for (const [name, fen, blockable] of cases) {
    it(`${name} -> ${blockable ? 'blockable' : 'not blockable'}`, () => {
      const p = parseFen(fen).pos;
      const king = findKing(p, p.turn);
      expect(attackers(p, king, opp(p.turn)).length, `${name}: expected the king to be in check`)
        .toBeGreaterThan(0);
      expect(canEverBlock(p, p.turn)).toBe(blockable);
    });
  }
});

describe('apply never touches the game it was given', () => {
  it('leaves both positions and all reserves as they were, and shares the untouched board', () => {
    const before = newGame();
    const snapA = fenOf(before, 'A');
    const snapB = fenOf(before, 'B');
    const after = apply(before, 'A', mv('e2', 'e4'));
    expect(fenOf(before, 'A')).toBe(snapA);
    expect(fenOf(before, 'B')).toBe(snapB);
    // The board that did not change is shared by reference, not copied.
    expect(after.game.pos.B).toBe(before.pos.B);
  });
  it('leaves the reserves alone when a capture transfers a piece', () => {
    const game = g('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1');
    const reserves = JSON.stringify(game.reserve);
    apply(game, 'A', mv('e4', 'd5'));
    expect(JSON.stringify(game.reserve)).toBe(reserves);
  });
});

describe('no two legal actions share a SAN', () => {
  const noDuplicates = (game: Game, b: Board) => {
    const sans = legalWithSan(game, b).map(x => x.san);
    expect(sans.filter((s, i) => sans.indexOf(s) !== i)).toEqual([]);
    return sans;
  };
  it('two pawns promoting onto the same square stay distinct', () => {
    // The black king stands clear of d7's pawn, so the position is legal with White to move.
    const sans = noDuplicates(g('2r3k1/1P1P4/8/8/8/8/8/4K3 w - - 0 1'), 'A');
    // Both promotions give check along rank 8, so both carry the suffix and stay distinct.
    expect(sans).toContain('bxc8=Q+');
    expect(sans).toContain('dxc8=Q+');
  });
  it('a knight moving to a square and a knight dropped on another stay distinct', () => {
    const sans = noDuplicates(g('4k3/8/8/8/8/5N2/8/4K3 w - - 0 1', R({ Aw: 'n' })), 'A');
    expect(sans).toContain('Nd4');
    expect(sans).toContain('N@d4');
  });
});
