import { type Action, type Color, DEFAULT_OPTIONS, type DropType, type Options, type Pocket, type Position, type BoardStatus, applyUnchecked, boardStatus, clonePosition, emptyPocket, initialPosition, legalActions, opp, sameAction } from './board.ts';

export type Board = 'A' | 'B';
export const otherBoard = (b: Board): Board => (b === 'A' ? 'B' : 'A');

/** Seats: A-w and B-b are partners (one human); A-b and B-w are partners (the other human). */
export interface Game {
  pos: Record<Board, Position>;
  /** reserve[board][color]: pieces seat (board,color) may drop. Always that seat's own colour. */
  reserve: Record<Board, Record<Color, Pocket>>;
  opts: Options;
}

export function newGame(opts: Options = DEFAULT_OPTIONS): Game {
  return {
    pos: { A: initialPosition(), B: initialPosition() },
    reserve: { A: { w: emptyPocket(), b: emptyPocket() }, B: { w: emptyPocket(), b: emptyPocket() } },
    opts,
  };
}

export function gameFrom(a: Position, b: Position, reserve?: Partial<Record<Board, Record<Color, Pocket>>>, opts: Options = DEFAULT_OPTIONS): Game {
  return {
    pos: { A: a, B: b },
    reserve: {
      A: reserve?.A ?? { w: emptyPocket(), b: emptyPocket() },
      B: reserve?.B ?? { w: emptyPocket(), b: emptyPocket() },
    },
    opts,
  };
}

const cloneReserve = (r: Game['reserve']): Game['reserve'] => ({
  A: { w: { ...r.A.w }, b: { ...r.A.b } }, B: { w: { ...r.B.w }, b: { ...r.B.b } },
});

export function legal(game: Game, board: Board): Action[] {
  const p = game.pos[board];
  return legalActions(p, game.reserve[board][p.turn], game.opts);
}

export function status(game: Game, board: Board): BoardStatus {
  const p = game.pos[board];
  return boardStatus(p, game.reserve[board][p.turn], game.opts);
}

export interface Transfer { toBoard: Board; color: Color; piece: DropType }
export interface ApplyResult { game: Game; captured: DropType | null; transfer: Transfer | null }

export class IllegalAction extends Error {}

export function apply(game: Game, board: Board, action: Action): ApplyResult {
  const p = game.pos[board];
  if (!legal(game, board).some(l => sameAction(l, action))) throw new IllegalAction(`illegal on ${board}: ${JSON.stringify(action)}`);
  const mover = p.turn;
  const { pos, captured } = applyUnchecked(p, action, game.opts);
  const reserve = cloneReserve(game.reserve);
  if (action.kind === 'drop') reserve[board][mover][action.piece]--;
  let transfer: Transfer | null = null;
  if (captured) {
    // Captured piece belongs to the opponent's colour; the partner seat on the other board has that colour.
    transfer = { toBoard: otherBoard(board), color: opp(mover), piece: captured };
    reserve[transfer.toBoard][transfer.color][captured]++;
  }
  const next: Game = { pos: { A: game.pos.A, B: game.pos.B, [board]: pos } as Game['pos'], reserve, opts: game.opts };
  return { game: next, captured, transfer };
}

export type GameResult =
  | { over: false }
  | { over: true; reason: 'mate'; board: Board; loser: Color };

/** Mate on either board ends the game. (Flags/resignation are handled by the server clock layer.) */
export function result(game: Game): GameResult {
  for (const board of ['A', 'B'] as const) {
    if (status(game, board) === 'mate') return { over: true, reason: 'mate', board, loser: game.pos[board].turn };
  }
  return { over: false };
}

export { clonePosition };
