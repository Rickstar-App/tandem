// Deriving what a seat sees from a room snapshot: orientation, seats, labels (BRIEF §5.2).
import { type Board, type Color, type Game, clonePosition, gameFrom, legal, legalActions, parseFen } from '@tandem/engine';
import type { RoomSnapshot, SeatId, Team } from '@tandem/server';

export const boards: Board[] = ['A', 'B'];
export const seatId = (b: Board, c: Color): SeatId => `${b}-${c}` as SeatId;
export const TEAM_OF: Record<SeatId, Team> = { 'A-w': 'WA', 'B-b': 'WA', 'A-b': 'BA', 'B-w': 'BA' };
export const other = (t: Team): Team => (t === 'WA' ? 'BA' : 'WA');

/** The colour a team holds on a board. Team White-A is White on A and Black on B. */
export const colorOn = (team: Team, b: Board): Color =>
  (team === 'WA') === (b === 'A') ? 'w' : 'b';

/** Rebuild the engine game from the snapshot's two FENs. */
export function gameFromSnapshot(s: Pick<RoomSnapshot, 'fen'>): Game {
  const a = parseFen(s.fen.A), b = parseFen(s.fen.B);
  return gameFrom(a.pos, b.pos, { A: a.pockets, B: b.pockets });
}

/** True when the board should be drawn with Black at the bottom. */
export const flippedFor = (viewTeam: Team, b: Board): boolean => colorOn(viewTeam, b) === 'b';

export const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

export function statusWords(st: string, turn: Color): string {
  switch (st) {
    case 'check': return `check, ${colorName(turn)} to move`;
    case 'pending': return `${colorName(turn)} is in check and needs a piece to block`;
    case 'mate': return `checkmate, ${colorName(turn)} is mated`;
    case 'stuck': return `${colorName(turn)} has no move and is waiting for a piece`;
    default: return `${colorName(turn)} to move`;
  }
}

/**
 * Actions available for a premove: the same generator, run as if it were already your turn.
 * The server still validates, and anything that became illegal is dropped silently (BRIEF §5.4).
 */
export function actionsAsIfMyTurn(game: Game, b: Board, color: Color) {
  const pos = game.pos[b];
  if (pos.turn === color) return legal(game, b);
  const hypothetical = { ...clonePosition(pos), turn: color, ep: -1 };
  return legalActions(hypothetical, game.reserve[b][color], game.opts);
}
