import { describe, expect, it } from 'vitest';
import { Action, DropType, Pocket, emptyPocket, parseSq as S } from '../src/board';
import { Board, Game, apply, gameFrom, legal, newGame } from '../src/game';
import { legalWithSan, parseSan, san } from '../src/notation';
import { parseFen } from '../src/fen';

const pk = (s: string): Pocket => { const p = emptyPocket(); for (const ch of s) p[ch as DropType]++; return p; };
const KINGS = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const R = (o: { Aw?: string; Ab?: string } = {}) => ({ A: { w: pk(o.Aw ?? ''), b: pk(o.Ab ?? '') }, B: { w: emptyPocket(), b: emptyPocket() } });
const g = (fenA: string, res?: ReturnType<typeof R>): Game => gameFrom(parseFen(fenA).pos, parseFen(KINGS).pos, res);
const mv = (f: string, t: string, promo?: 'n' | 'b' | 'r' | 'q'): Action => ({ kind: 'move', from: S(f), to: S(t), ...(promo ? { promo } : {}) });
const dr = (piece: DropType, to: string): Action => ({ kind: 'drop', piece, to: S(to) });

describe('san', () => {
  it('pawn moves, captures and promotions', () => {
    expect(san(newGame(), 'A', mv('e2', 'e4'))).toBe('e4');
    expect(san(g('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'), 'A', mv('e4', 'd5'))).toBe('exd5');
    expect(san(g('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'), 'A', mv('a7', 'a8', 'q'))).toBe('a8=Q+');
    expect(san(g('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'), 'A', mv('a7', 'a8', 'n'))).toBe('a8=N');
  });
  it('en passant is written as a pawn capture', () => {
    expect(san(g('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), 'A', mv('e5', 'd6'))).toBe('exd6');
  });
  it('castling', () => {
    const game = g('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(san(game, 'A', mv('e1', 'g1'))).toBe('O-O');
    expect(san(game, 'A', mv('e1', 'c1'))).toBe('O-O-O');
  });
  it('drops, with check and mate suffixes', () => {
    expect(san(g(KINGS, R({ Aw: 'n' })), 'A', dr('n', 'e4'))).toBe('N@e4');
    expect(san(g(KINGS, R({ Aw: 'r' })), 'A', dr('r', 'a8'))).toBe('R@a8+');
    expect(san(g('6rk/6pp/8/8/8/8/8/4K3 w - - 0 1', R({ Aw: 'n' })), 'A', dr('n', 'f7'))).toBe('N@f7#');
  });
  it('a check that only a drop could block is pending, and still gets +', () => {
    expect(san(g('6k1/5ppp/8/8/8/8/8/4K3 w - - 0 1', R({ Aw: 'r' })), 'A', dr('r', 'e8'))).toBe('R@e8+');
  });
  it('disambiguates by file, then rank, then square', () => {
    // Both rooks reach d1 here (nothing between), so the file disambiguates.
    const two = g('4k3/8/8/8/8/8/8/R5RK w - - 0 1');
    expect(san(two, 'A', mv('a1', 'd1'))).toBe('Rad1');
    expect(san(two, 'A', mv('g1', 'd1'))).toBe('Rgd1');
    // With the king between them, only one rook reaches d1, so no disambiguation.
    expect(san(g('4k3/8/8/8/8/8/8/R3K2R w - - 0 1'), 'A', mv('a1', 'd1'))).toBe('Rd1');
    expect(san(g('4k3/8/8/8/R7/8/8/R3K3 w - - 0 1'), 'A', mv('a1', 'a3'))).toBe('R1a3');
    const three = g('4k3/8/8/8/Q6Q/8/8/Q3K3 w - - 0 1');
    expect(san(three, 'A', mv('a4', 'd4'))).toBe('Qa4d4');
  });
  it('rejects an action that is not legal', () => {
    expect(() => san(newGame(), 'A', mv('e2', 'e5'))).toThrow();
  });
});

describe('parseSan', () => {
  it('round-trips every legal action on both boards of a busy position', () => {
    let game = newGame();
    const seq: [Board, string][] = [['A', 'e4'], ['B', 'd4'], ['A', 'd5'], ['B', 'Nf6'], ['A', 'exd5'], ['B', 'Nc3']];
    for (const [b, text] of seq) {
      const a = parseSan(game, b, text);
      expect(a, `${b} ${text}`).not.toBeNull();
      game = apply(game, b, a!).game;
    }
    for (const b of ['A', 'B'] as Board[]) {
      for (const { action, san: s } of legalWithSan(game, b)) {
        expect(parseSan(game, b, s), s).toEqual(action);
      }
    }
  });
  it('accepts loose input: missing +, missing x, 0-0 for O-O, and UCI', () => {
    const game = g('4k3/8/8/3p4/4P3/8/8/R3K2R w KQ - 0 1');
    expect(parseSan(game, 'A', 'ed5')).toEqual(mv('e4', 'd5'));
    expect(parseSan(game, 'A', '0-0')).toEqual(mv('e1', 'g1'));
    expect(parseSan(game, 'A', 'e1g1')).toEqual(mv('e1', 'g1'));
    expect(parseSan(game, 'A', 'e4d5')).toEqual(mv('e4', 'd5'));
  });
  it('returns null for illegal or unparsable text', () => {
    const game = newGame();
    for (const bad of ['', 'xyz', 'e5', 'N@f3', 'O-O', 'Qh5#']) expect(parseSan(game, 'A', bad), bad).toBeNull();
  });
  it('drops parse with their piece letter', () => {
    const game = g(KINGS, R({ Aw: 'nq' }));
    expect(parseSan(game, 'A', 'N@e4')).toEqual(dr('n', 'e4'));
    expect(parseSan(game, 'A', 'Q@h8')).toEqual(dr('q', 'h8'));
    expect(parseSan(game, 'A', 'R@e4')).toBeNull();
  });
});

describe('san is unique per legal action', () => {
  it('no two legal actions share a SAN across 200 random positions', () => {
    let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let game = newGame(); let checked = 0;
    for (let i = 0; i < 200; i++) {
      for (const b of ['A', 'B'] as Board[]) {
        const list = legalWithSan(game, b).map(x => x.san);
        expect(new Set(list).size, `duplicate SAN on ${b}`).toBe(list.length);
        checked += list.length;
      }
      const boards = (['A', 'B'] as Board[]).filter(b => legal(game, b).length);
      if (!boards.length) break;
      const b = boards[Math.floor(rnd() * boards.length)]!;
      const acts = legal(game, b);
      game = apply(game, b, acts[Math.floor(rnd() * acts.length)]!).game;
    }
    expect(checked).toBeGreaterThan(5000);
  });
});
