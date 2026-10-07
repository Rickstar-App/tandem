import { describe, expect, it } from 'vitest';
import { Action, Color, DropType, Pocket, emptyPocket, parseSq as S } from '../src/board';
import { Board, Game, apply, gameFrom, legal, result, status } from '../src/game';
import { parseFen } from '../src/fen';

const pk = (s: string): Pocket => { const p = emptyPocket(); for (const ch of s) p[ch as DropType]++; return p; };
type Res = Partial<Record<Board, Record<Color, Pocket>>>;
const R = (o: { Aw?: string; Ab?: string; Bw?: string; Bb?: string } = {}): Res => ({
  A: { w: pk(o.Aw ?? ''), b: pk(o.Ab ?? '') }, B: { w: pk(o.Bw ?? ''), b: pk(o.Bb ?? '') },
});
const KINGS = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
function g(fenA: string, fenB = KINGS, reserve?: Res, droppedRookCastling = true): Game {
  return gameFrom(parseFen(fenA).pos, parseFen(fenB).pos, reserve, { droppedRookCastling });
}
const mv = (from: string, to: string, promo?: 'n' | 'b' | 'r' | 'q'): Action => ({ kind: 'move', from: S(from), to: S(to), ...(promo ? { promo } : {}) });
const dr = (piece: DropType, to: string): Action => ({ kind: 'drop', piece, to: S(to) });
const has = (game: Game, b: Board, a: Action) => legal(game, b).some(l => JSON.stringify(l) === JSON.stringify(a));

describe('capture transfer', () => {
  it('white capture on A feeds black reserve on B, keeping the captured colour', () => {
    const r = apply(g('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), 'A', mv('e4', 'd5'));
    expect(r.transfer).toEqual({ toBoard: 'B', color: 'b', piece: 'n' });
    expect(r.game.reserve.B.b.n).toBe(1);
    expect(r.game.reserve.A.w.n).toBe(0);
  });
  it('black capture on A feeds white reserve on B', () => {
    const r = apply(g('4k3/8/8/8/3p4/4N3/8/4K3 b - - 0 1'), 'A', mv('d4', 'e3'));
    expect(r.transfer).toEqual({ toBoard: 'B', color: 'w', piece: 'n' });
  });
  it('capture on B feeds the right seat on A', () => {
    const r = apply(g(KINGS, '4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), 'B', mv('e4', 'd5'));
    expect(r.transfer).toEqual({ toBoard: 'A', color: 'b', piece: 'n' });
  });
  it('en passant transfers a pawn', () => {
    const r = apply(g('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), 'A', mv('e5', 'd6'));
    expect(r.transfer?.piece).toBe('p');
  });
  it('a captured piece is usable on the partner board immediately, and the drop consumes it', () => {
    let game = apply(g('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1', '4k3/8/8/8/8/8/8/4K3 b - - 0 1'), 'A', mv('e4', 'd5')).game;
    expect(has(game, 'B', dr('n', 'e5'))).toBe(true);
    game = apply(game, 'B', dr('n', 'e5')).game;
    expect(game.reserve.B.b.n).toBe(0);
    expect(game.pos.B.sq[S('e5')]).toEqual({ c: 'b', t: 'n' });
  });
  it('only the side to move on that board may act', () => {
    const game = g('4k3/8/8/8/8/8/8/4K3 w - - 0 1', KINGS, R({ Ab: 'n' }));
    expect(legal(game, 'A').some(a => a.kind === 'drop')).toBe(false); // black reserve, white to move
  });
});

describe('promotion and counterfeits', () => {
  it('a captured promoted queen becomes a pawn, a real queen stays a queen', () => {
    const promoted = apply(g('r3k3/8/8/8/8/8/8/Q~3K3 b - - 0 1'), 'A', mv('a8', 'a1'));
    expect(promoted.transfer).toEqual({ toBoard: 'B', color: 'w', piece: 'p' });
    const real = apply(g('r3k3/8/8/8/8/8/8/Q3K3 b - - 0 1'), 'A', mv('a8', 'a1'));
    expect(real.transfer?.piece).toBe('q');
  });
  it('promotion via play keeps the flag so the piece reverts when captured', () => {
    let game = g('8/Pk6/8/8/8/8/8/4K3 w - - 0 1');
    game = apply(game, 'A', mv('a7', 'a8', 'q')).game;
    expect(game.pos.A.sq[S('a8')]).toEqual({ c: 'w', t: 'q', promoted: true });
    const r = apply(game, 'A', mv('b7', 'a8'));
    expect(r.transfer?.piece).toBe('p');
  });
  it('promoted flag follows the piece when it moves', () => {
    let game = g('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    game = apply(game, 'A', mv('a7', 'a8', 'r')).game;
    game = apply(game, 'A', mv('e8', 'd7')).game;
    game = apply(game, 'A', mv('a8', 'a1')).game;
    expect(game.pos.A.sq[S('a1')]?.promoted).toBe(true);
  });
  it('all four promotion choices are offered', () => {
    const promos = legal(g('8/P3k3/8/8/8/8/8/4K3 w - - 0 1'), 'A').filter(a => a.kind === 'move' && a.from === S('a7')).map(a => (a as { promo?: string }).promo);
    expect(promos.sort()).toEqual(['b', 'n', 'q', 'r']);
  });
});

describe('drops', () => {
  it('pawns may not be dropped on rank 1 or 8 but may on ranks 2 to 7', () => {
    const game = g(KINGS, KINGS, R({ Aw: 'p' }));
    expect(has(game, 'A', dr('p', 'a1'))).toBe(false);
    expect(has(game, 'A', dr('p', 'h8'))).toBe(false);
    expect(has(game, 'A', dr('p', 'a2'))).toBe(true);
    expect(has(game, 'A', dr('p', 'a7'))).toBe(true);
    expect(has(game, 'A', dr('n', 'a1'))).toBe(false); // none in reserve
  });
  it('other pieces may be dropped on the back ranks', () => {
    const game = g(KINGS, KINGS, R({ Aw: 'nbrq' }));
    for (const p of ['n', 'b', 'r', 'q'] as const) { expect(has(game, 'A', dr(p, 'a1'))).toBe(true); expect(has(game, 'A', dr(p, 'a8'))).toBe(true); }
  });
  it('cannot drop on an occupied square', () => {
    expect(has(g(KINGS, KINGS, R({ Aw: 'n' })), 'A', dr('n', 'e1'))).toBe(false);
  });
  it('a pawn dropped on its 2nd rank may double-step; on any other rank it may not', () => {
    let game = apply(g(KINGS, KINGS, R({ Aw: 'pp' })), 'A', dr('p', 'c2')).game;
    game = apply(game, 'A', mv('e8', 'e7')).game;
    expect(has(game, 'A', mv('c2', 'c4'))).toBe(true);
    let g2 = apply(g(KINGS, KINGS, R({ Aw: 'p' })), 'A', dr('p', 'c3')).game;
    g2 = apply(g2, 'A', mv('e8', 'e7')).game;
    expect(has(g2, 'A', mv('c3', 'c4'))).toBe(true);
    expect(has(g2, 'A', mv('c3', 'c5'))).toBe(false);
  });
  it('black pawn dropped on rank 7 double-steps', () => {
    let game = apply(g(KINGS.replace(' w ', ' b '), KINGS, R({ Ab: 'p' })), 'A', dr('p', 'c7')).game;
    game = apply(game, 'A', mv('e1', 'e2')).game;
    expect(has(game, 'A', mv('c7', 'c5'))).toBe(true);
  });
  it('en passant works against a dropped pawn that double-steps', () => {
    let game = g('4k3/8/8/4P3/8/8/8/4K3 b - - 0 1', KINGS, R({ Ab: 'p' }));
    game = apply(game, 'A', dr('p', 'd7')).game;
    game = apply(game, 'A', mv('e1', 'e2')).game;
    game = apply(game, 'A', mv('d7', 'd5')).game;
    expect(has(game, 'A', mv('e5', 'd6'))).toBe(true);
  });
  it('while in check, only a drop that blocks is legal', () => {
    const game = g('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', KINGS, R({ Aw: 'np' }));
    expect(has(game, 'A', dr('n', 'e4'))).toBe(true);
    expect(has(game, 'A', dr('p', 'e7'))).toBe(true);
    expect(has(game, 'A', dr('n', 'a4'))).toBe(false);
    expect(status(game, 'A')).toBe('check');
  });
  it('a drop may give check', () => {
    const game = apply(g('4k3/8/8/8/8/8/8/4K3 w - - 0 1', KINGS, R({ Aw: 'r' })), 'A', dr('r', 'a8')).game;
    expect(status(game, 'A')).toBe('check');
  });
  it('a drop that leaves your own king in check is illegal', () => {
    const game = g('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', KINGS, R({ Aw: 'n' }));
    // king e1 is attacked by the rook on e2; a knight drop elsewhere does not help
    expect(has(game, 'A', dr('n', 'a3'))).toBe(false);
  });
});

describe('checkmate, pending and no stalemate', () => {
  it('smothered mate by knight drop ends the game', () => {
    const game = apply(g('6rk/6pp/8/8/8/8/8/4K3 w - - 0 1', KINGS, R({ Aw: 'n' })), 'A', dr('n', 'f7')).game;
    expect(status(game, 'A')).toBe('mate');
    expect(result(game)).toEqual({ over: true, reason: 'mate', board: 'A', loser: 'b' });
  });
  it('knight-check mate is mate even if the victim holds reserve pieces', () => {
    const game = apply(g('6rk/6pp/8/8/8/8/8/4K3 w - - 0 1', KINGS, R({ Aw: 'n', Ab: 'qqp' })), 'A', dr('n', 'f7')).game;
    expect(status(game, 'A')).toBe('mate');
  });
  it('contact check mate', () => {
    expect(status(g('7k/6Q1/5B2/8/8/8/8/4K3 b - - 0 1'), 'A')).toBe('mate');
  });
  it('double check mate', () => {
    const fen = '3rkr2/3p1p2/3N4/8/8/8/8/4R1K1 b - - 0 1';
    expect(status(g(fen, KINGS, R({ Ab: 'q' })), 'A')).toBe('mate');
  });
  it('double check with an escape square is not mate', () => {
    const game = g('4k3/8/3N4/8/8/8/8/4R1K1 b - - 0 1');
    expect(status(game, 'A')).toBe('check');
    expect(has(game, 'A', mv('e8', 'd8'))).toBe(true);
  });
  it('slider check with a gap and no usable piece is PENDING, not mate', () => {
    const game = apply(g('6k1/5ppp/8/8/8/8/8/4K3 w - - 0 1', KINGS, R({ Aw: 'r' })), 'A', dr('r', 'e8')).game;
    expect(status(game, 'A')).toBe('pending');
    expect(result(game)).toEqual({ over: false });
  });
  it('pending resolves when a blocking piece arrives', () => {
    const base = apply(g('6k1/5ppp/8/8/8/8/8/4K3 w - - 0 1', KINGS, R({ Aw: 'r', Ab: 'n' })), 'A', dr('r', 'e8')).game;
    expect(status(base, 'A')).toBe('check');
    expect(has(base, 'A', dr('n', 'f8'))).toBe(true);
  });
  it('a pawn-only reserve cannot block on rank 8 but the check is still pending (a piece could arrive)', () => {
    const game = apply(g('6k1/5ppp/8/8/8/8/8/4K3 w - - 0 1', KINGS, R({ Aw: 'r', Ab: 'p' })), 'A', dr('r', 'e8')).game;
    expect(status(game, 'A')).toBe('pending');
  });
  it('there is no stalemate: no legal action and not in check is "stuck"', () => {
    const game = g('k7/8/1Q6/8/8/8/8/4K3 b - - 0 1');
    expect(status(game, 'A')).toBe('stuck');
    expect(result(game)).toEqual({ over: false });
  });
  it('a stuck side is freed by a drop', () => {
    expect(status(g('k7/8/1Q6/8/8/8/8/4K3 b - - 0 1', KINGS, R({ Ab: 'p' })), 'A')).toBe('ok');
  });
  it('mate on board B ends the game too', () => {
    const game = apply(g(KINGS, '6rk/6pp/8/8/8/8/8/4K3 w - - 0 1', R({ Bw: 'n' })), 'B', dr('n', 'f7')).game;
    expect(result(game)).toEqual({ over: true, reason: 'mate', board: 'B', loser: 'b' });
  });
});

describe('castling with dropped rooks (brief U1)', () => {
  const play = (flag: boolean) => {
    let game = g('4k3/8/8/8/8/8/8/4K3 w K - 0 1', KINGS, R({ Aw: 'r' }), flag);
    game = apply(game, 'A', dr('r', 'a1')).game;
    game = apply(game, 'A', mv('e8', 'd8')).game;
    return game;
  };
  it('allowed when the flag is on and the king is unmoved', () => expect(has(play(true), 'A', mv('e1', 'c1'))).toBe(true));
  it('not allowed when the flag is off', () => expect(has(play(false), 'A', mv('e1', 'c1'))).toBe(false));
  it('never allowed once the king has moved', () => {
    let game = g('4k3/8/8/8/8/8/8/4K3 w - - 0 1', KINGS, R({ Aw: 'r' }));
    game = apply(game, 'A', mv('e1', 'e2')).game;
    game = apply(game, 'A', mv('e8', 'd8')).game;
    game = apply(game, 'A', mv('e2', 'e1')).game;
    game = apply(game, 'A', mv('d8', 'e8')).game;
    game = apply(game, 'A', dr('r', 'a1')).game;
    game = apply(game, 'A', mv('e8', 'd8')).game;
    expect(has(game, 'A', mv('e1', 'c1'))).toBe(false);
  });
  it('a rook that has moved away from the corner loses the right', () => {
    let game = g('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
    game = apply(game, 'A', mv('a1', 'a2')).game;
    game = apply(game, 'A', mv('e8', 'd8')).game;
    game = apply(game, 'A', mv('a2', 'a1')).game;
    game = apply(game, 'A', mv('d8', 'e8')).game;
    expect(has(game, 'A', mv('e1', 'c1'))).toBe(false);
  });
});

describe('invalid input is rejected', () => {
  it('throws on illegal actions', () => {
    expect(() => apply(g(KINGS), 'A', mv('e1', 'e5'))).toThrow();
    expect(() => apply(g(KINGS), 'A', dr('q', 'a4'))).toThrow();
  });
});
