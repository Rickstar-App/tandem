// Standard algebraic notation for bughouse (BRIEF §3.10). Drops use `@`: N@f3, P@e4.

import { type Action, type DropType, type Options, type PieceType, type Pocket, type Position, type Sq, applyUnchecked, boardStatus, file, isCastle, legalActions, rank, sameAction, sqName } from './board.ts';
import { type Board, type Game, legal, status } from './game.ts';

const UPPER: Record<PieceType, string> = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

/** Suffix for the position *after* the action: '#' mate, '+' check or pending, '' otherwise. */
function suffix(pos: Position, pocket: Pocket, opts: Options): string {
  const st = boardStatus(pos, pocket, opts);
  if (st === 'mate') return '#';
  return st === 'check' || st === 'pending' ? '+' : '';
}

/** SAN for a legal action on `board`. Throws if the action is not legal there. */
export function san(game: Game, board: Board, action: Action): string {
  const pos = game.pos[board];
  const all = legal(game, board);
  if (!all.some(l => sameAction(l, action))) throw new Error('san: action is not legal');
  const after = applyUnchecked(pos, action, game.opts);
  // The suffix describes the opponent's position, so use the opponent's reserve.
  const oppPocket = game.reserve[board][after.pos.turn];
  const suf = suffix(after.pos, oppPocket, game.opts);

  if (action.kind === 'drop') return `${UPPER[action.piece]}@${sqName(action.to)}${suf}`;

  if (isCastle(pos, action)) return (file(action.to) === 6 ? 'O-O' : 'O-O-O') + suf;

  const piece = pos.sq[action.from]!;
  const target = pos.sq[action.to];
  const isEp = piece.t === 'p' && !target && file(action.from) !== file(action.to);
  const capture = !!target || isEp;

  if (piece.t === 'p') {
    const promo = action.promo ? `=${UPPER[action.promo]}` : '';
    const body = capture ? `${'abcdefgh'[file(action.from)]}x${sqName(action.to)}` : sqName(action.to);
    return body + promo + suf;
  }

  // Disambiguate against other same-type pieces that can legally reach the same square.
  const rivals = all.filter(a =>
    a.kind === 'move' && a.to === action.to && a.from !== action.from &&
    pos.sq[a.from]?.t === piece.t && pos.sq[a.from]?.c === piece.c);
  let disamb = '';
  if (rivals.length) {
    const sameFile = rivals.some(r => r.kind === 'move' && file(r.from) === file(action.from));
    const sameRank = rivals.some(r => r.kind === 'move' && rank(r.from) === rank(action.from));
    if (!sameFile) disamb = 'abcdefgh'[file(action.from)]!;
    else if (!sameRank) disamb = String(rank(action.from) + 1);
    else disamb = sqName(action.from);
  }
  return `${UPPER[piece.t]}${disamb}${capture ? 'x' : ''}${sqName(action.to)}${suf}`;
}

/**
 * Parse SAN against the legal actions of `board`. Returns the action, or null if the text
 * matches no legal action. Matching is exact against generated SAN, with a lenient pass that
 * ignores check/mate suffixes and the 'x' capture marker, and accepts 0-0 for O-O.
 */
export function parseSan(game: Game, board: Board, text: string): Action | null {
  const raw = text.trim();
  if (!raw) return null;
  const actions = legal(game, board);
  const gen = actions.map(a => san(game, board, a));

  const exact = gen.indexOf(raw);
  if (exact >= 0) return actions[exact]!;

  const loose = (s: string) => s.replace(/[+#x]/g, '').replace(/0/g, 'O').replace(/\s+/g, '');
  const want = loose(raw);
  const hits = actions.filter((_, i) => loose(gen[i]!) === want);
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) return null; // ambiguous without the discarded markers

  // UCI-style fallback (e2e4, e7e8q, N@f3 handled above): useful for tests and power users.
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(raw.toLowerCase());
  if (m) {
    const from = sqName2(m[1]!), to = sqName2(m[2]!);
    const cand = actions.filter(a => a.kind === 'move' && a.from === from && a.to === to &&
      (m[3] ? a.promo === m[3] : !a.promo));
    if (cand.length === 1) return cand[0]!;
  }
  return null;
}

function sqName2(n: string): Sq { return (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97); }

/** Every legal action on `board` with its SAN, for autocomplete and the move list. */
export function legalWithSan(game: Game, board: Board): { action: Action; san: string }[] {
  return legal(game, board).map(action => ({ action, san: san(game, board, action) }));
}

export { status as boardState };
