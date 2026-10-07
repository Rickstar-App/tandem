// Cross-check single-board legality (moves + drops + promotion + ep + castling) against lichess's chessops Crazyhouse.
import { describe, expect, it } from 'vitest';
import { Crazyhouse } from 'chessops/variant';
import { parseFen as cParse } from 'chessops/fen';
import { perft as cPerft } from 'chessops/debug';
import { Color, DropType, Pocket, Position, applyUnchecked, emptyPocket, initialPosition, legalActions, opp } from '../src/board';
import { parseFen, toFen } from '../src/fen';

const OPTS = { droppedRookCastling: false }; // chessops/lichess: a dropped rook cannot castle

// Single-board crazyhouse semantics: a capture feeds the capturer's own pocket.
function ourPerft(pos: Position, pockets: Record<Color, Pocket>, depth: number): number {
  if (depth === 0) return 1;
  const acts = legalActions(pos, pockets[pos.turn], OPTS);
  if (depth === 1) return acts.length;
  let n = 0;
  for (const a of acts) {
    const c = pos.turn;
    const { pos: np, captured } = applyUnchecked(pos, a, OPTS);
    const pk = { w: { ...pockets.w }, b: { ...pockets.b } };
    if (a.kind === 'drop') pk[c][a.piece]--;
    if (captured) pk[c][captured as DropType]++;
    n += ourPerft(np, pk, depth - 1);
  }
  return n;
}

function theirPerft(fen: string, depth: number): number {
  const setup = cParse(fen).unwrap();
  const pos = Crazyhouse.fromSetup(setup).unwrap();
  return cPerft(pos, depth, false);
}

const fens: [string, number][] = [
  [toFen(initialPosition(), { w: emptyPocket(), b: emptyPocket() }), 4],
  ['r3k2r/pppq1ppp/2n2n2/3pp3/1b2P1b1/2NP1N2/PPPQ1PPP/R3K2R[] w KQkq - 0 1', 3],
  ['r3k2r/pppq1ppp/2n2n2/3pp3/1b2P1b1/2NP1N2/PPPQ1PPP/R3K2R[NPnp] w KQkq - 0 1', 3],
  ['4k3/8/8/8/8/8/8/4K3[QRBNPqrbnp] w - - 0 1', 3],
  ['4k3/8/8/8/8/8/8/R3K2R[Pn] w KQ - 0 1', 3],
  ['r3k2r/8/8/8/8/8/8/4K3[Rb] b kq - 0 1', 3],
  ['8/P1k5/8/8/8/8/p1K5/8[Qq] w - - 0 1', 3],
  ['4k3/8/8/3pP3/8/8/8/4K3[P] w - d6 0 1', 3],
  ['rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR[Pp] w KQkq d6 0 1', 3],
  ['4k3/8/8/8/8/8/1Q~6/4K3[p] b - - 0 1', 3], // promoted queen on the board
  ['6k1/5ppp/8/8/8/8/5PPP/3R2K1[Nn] b - - 0 1', 3],
];

describe('perft vs chessops Crazyhouse', () => {
  fens.forEach(([fen, depth]) => {
    it(`${fen.slice(0, 50)}… d${depth}`, () => {
      const { pos, pockets } = parseFen(fen);
      for (let d = 1; d <= depth; d++) expect(ourPerft(pos, pockets, d), `depth ${d}`).toBe(theirPerft(fen, d));
    });
  });
});

// Random play: at every visited position, our legal set must have the same size as theirs.
describe('random playouts agree move-count with chessops at every ply', () => {
  it('300 random games, 60 plies each', () => {
    let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let g = 0; g < 300; g++) {
      let pos = initialPosition(); let pockets = { w: emptyPocket(), b: emptyPocket() };
      for (let ply = 0; ply < 60; ply++) {
        const acts = legalActions(pos, pockets[pos.turn], OPTS);
        const fen = toFen(pos, pockets);
        const theirs = theirPerft(fen, 1);
        expect(acts.length, fen).toBe(theirs);
        if (!acts.length) break;
        const a = acts[Math.floor(rnd() * acts.length)]!; const c = pos.turn;
        const r = applyUnchecked(pos, a, OPTS);
        if (a.kind === 'drop') pockets[c][a.piece]--;
        if (r.captured) pockets[c][r.captured]++;
        pos = r.pos;
      }
    }
  });
});
