// Single-board rules: move/drop generation and application. No reserves-across-boards logic here
// (see game.ts). Squares are 0..63, a1 = 0, h8 = 63; file = sq & 7, rank = sq >> 3.

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type DropType = 'p' | 'n' | 'b' | 'r' | 'q';
export type Pocket = Record<DropType, number>;
export type Sq = number;

export interface Piece { c: Color; t: PieceType; promoted?: true }

export interface Castle {
  kingUnmoved: Record<Color, boolean>;
  /** Is the rook currently on that corner eligible to castle (arrived there unmoved)? */
  rookOk: Record<Color, { k: boolean; q: boolean }>;
}

export interface Position {
  sq: (Piece | null)[];
  turn: Color;
  castle: Castle;
  /** En passant target square (the square the pawn skipped over), or -1. */
  ep: Sq;
}

export interface Options {
  /** A rook dropped on its home corner may castle (bughouse rule, brief U1). */
  droppedRookCastling: boolean;
}
export const DEFAULT_OPTIONS: Options = { droppedRookCastling: true };

export type Action =
  | { kind: 'move'; from: Sq; to: Sq; promo?: 'n' | 'b' | 'r' | 'q' }
  | { kind: 'drop'; piece: DropType; to: Sq };

export const emptyPocket = (): Pocket => ({ p: 0, n: 0, b: 0, r: 0, q: 0 });
export const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const file = (s: Sq) => s & 7;
export const rank = (s: Sq) => s >> 3;
export const sqOf = (f: number, r: number): Sq => r * 8 + f;
export const inBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;

export function sqName(s: Sq): string { return 'abcdefgh'[file(s)]! + (rank(s) + 1); }
export function parseSq(n: string): Sq { return sqOf(n.charCodeAt(0) - 97, +n[1]! - 1); }

const KNIGHT: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const BISHOP_DIRS: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

const HOME_RANK: Record<Color, number> = { w: 0, b: 7 };

export function initialPosition(): Position {
  const sq: (Piece | null)[] = Array(64).fill(null);
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let f = 0; f < 8; f++) {
    sq[sqOf(f, 0)] = { c: 'w', t: back[f]! };
    sq[sqOf(f, 1)] = { c: 'w', t: 'p' };
    sq[sqOf(f, 6)] = { c: 'b', t: 'p' };
    sq[sqOf(f, 7)] = { c: 'b', t: back[f]! };
  }
  return {
    sq, turn: 'w', ep: -1,
    castle: { kingUnmoved: { w: true, b: true }, rookOk: { w: { k: true, q: true }, b: { k: true, q: true } } },
  };
}

export function clonePosition(p: Position): Position {
  return {
    sq: p.sq.slice(), turn: p.turn, ep: p.ep,
    castle: {
      kingUnmoved: { ...p.castle.kingUnmoved },
      rookOk: { w: { ...p.castle.rookOk.w }, b: { ...p.castle.rookOk.b } },
    },
  };
}

export function findKing(p: Position, c: Color): Sq {
  for (let i = 0; i < 64; i++) { const x = p.sq[i]; if (x && x.t === 'k' && x.c === c) return i; }
  return -1;
}

/** Squares of `by`-coloured pieces attacking `target`. */
export function attackers(p: Position, target: Sq, by: Color): Sq[] {
  const out: Sq[] = [];
  const tf = file(target), tr = rank(target);
  const at = (f: number, r: number) => (inBoard(f, r) ? p.sq[sqOf(f, r)] : null);
  const pr = by === 'w' ? tr - 1 : tr + 1; // a `by` pawn sits one rank behind the target
  for (const df of [-1, 1]) { const x = at(tf + df, pr); if (x && x.c === by && x.t === 'p') out.push(sqOf(tf + df, pr)); }
  for (const [df, dr] of KNIGHT) { const x = at(tf + df, tr + dr); if (x && x.c === by && x.t === 'n') out.push(sqOf(tf + df, tr + dr)); }
  for (const [df, dr] of KING) { const x = at(tf + df, tr + dr); if (x && x.c === by && x.t === 'k') out.push(sqOf(tf + df, tr + dr)); }
  const ray = (dirs: [number, number][], types: PieceType[]) => {
    for (const [df, dr] of dirs) {
      let f = tf + df, r = tr + dr;
      while (inBoard(f, r)) {
        const x = p.sq[sqOf(f, r)];
        if (x) { if (x.c === by && types.includes(x.t)) out.push(sqOf(f, r)); break; }
        f += df; r += dr;
      }
    }
  };
  ray(ROOK_DIRS, ['r', 'q']);
  ray(BISHOP_DIRS, ['b', 'q']);
  return out;
}

export const isAttacked = (p: Position, s: Sq, by: Color) => attackers(p, s, by).length > 0;

export function inCheck(p: Position, c: Color = p.turn): boolean {
  const k = findKing(p, c);
  return k >= 0 && isAttacked(p, k, opp(c));
}

function pseudoMoves(p: Position): Action[] {
  const c = p.turn, out: Action[] = [];
  const push = (from: Sq, to: Sq) => out.push({ kind: 'move', from, to });
  for (let from = 0; from < 64; from++) {
    const x = p.sq[from];
    if (!x || x.c !== c) continue;
    const f = file(from), r = rank(from);
    if (x.t === 'p') {
      const dir = c === 'w' ? 1 : -1, startRank = c === 'w' ? 1 : 6, lastRank = c === 'w' ? 7 : 0;
      const add = (to: Sq) => {
        if (rank(to) === lastRank) for (const promo of ['q', 'r', 'b', 'n'] as const) out.push({ kind: 'move', from, to, promo });
        else push(from, to);
      };
      const one = sqOf(f, r + dir);
      if (inBoard(f, r + dir) && !p.sq[one]) {
        add(one);
        const two = sqOf(f, r + 2 * dir);
        if (r === startRank && !p.sq[two]) push(from, two);
      }
      for (const df of [-1, 1]) {
        if (!inBoard(f + df, r + dir)) continue;
        const to = sqOf(f + df, r + dir), t = p.sq[to];
        if (t && t.c !== c) add(to);
        else if (!t && to === p.ep) push(from, to);
      }
    } else if (x.t === 'n' || x.t === 'k') {
      for (const [df, dr] of x.t === 'n' ? KNIGHT : KING) {
        if (!inBoard(f + df, r + dr)) continue;
        const to = sqOf(f + df, r + dr), t = p.sq[to];
        if (!t || t.c !== c) push(from, to);
      }
    } else {
      const dirs = x.t === 'r' ? ROOK_DIRS : x.t === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [df, dr] of dirs) {
        let nf = f + df, nr = r + dr;
        while (inBoard(nf, nr)) {
          const to = sqOf(nf, nr), t = p.sq[to];
          if (!t) push(from, to);
          else { if (t.c !== c) push(from, to); break; }
          nf += df; nr += dr;
        }
      }
    }
  }
  return out;
}

function castlingMoves(p: Position): Action[] {
  const c = p.turn, hr = HOME_RANK[c], e = sqOf(4, hr);
  const king = p.sq[e];
  if (!king || king.t !== 'k' || king.c !== c || !p.castle.kingUnmoved[c]) return [];
  if (isAttacked(p, e, opp(c))) return [];
  const out: Action[] = [];
  const side = (rookFile: number, between: number[], pass: number[], ok: boolean, to: number) => {
    const rk = p.sq[sqOf(rookFile, hr)];
    if (!ok || !rk || rk.t !== 'r' || rk.c !== c) return;
    if (between.some(f => p.sq[sqOf(f, hr)])) return;
    if (pass.some(f => isAttacked(p, sqOf(f, hr), opp(c)))) return;
    out.push({ kind: 'move', from: e, to: sqOf(to, hr) });
  };
  side(7, [5, 6], [5, 6], p.castle.rookOk[c].k, 6);
  side(0, [1, 2, 3], [3, 2], p.castle.rookOk[c].q, 2);
  return out;
}

export function isCastle(p: Position, a: Action): boolean {
  if (a.kind !== 'move') return false;
  const x = p.sq[a.from];
  return !!x && x.t === 'k' && Math.abs(file(a.to) - file(a.from)) === 2;
}

export interface Applied { pos: Position; captured: DropType | null }

/** Apply an action without legality checking. `captured` already reflects promoted -> pawn. */
export function applyUnchecked(p: Position, a: Action, opts: Options = DEFAULT_OPTIONS): Applied {
  const n = clonePosition(p), c = p.turn;
  let captured: DropType | null = null;
  n.ep = -1;
  if (a.kind === 'drop') {
    n.sq[a.to] = { c, t: a.piece };
    if (a.piece === 'r' && opts.droppedRookCastling && rank(a.to) === HOME_RANK[c]) {
      if (file(a.to) === 7) n.castle.rookOk[c].k = true;
      if (file(a.to) === 0) n.castle.rookOk[c].q = true;
    }
  } else {
    const x = p.sq[a.from]!;
    const target = p.sq[a.to];
    if (target) captured = target.promoted ? 'p' : (target.t as DropType);
    if (x.t === 'p' && !target && file(a.from) !== file(a.to)) { // en passant
      const capSq = sqOf(file(a.to), rank(a.from));
      captured = 'p'; // only a real pawn can be taken en passant
      n.sq[capSq] = null;
    }
    const moved: Piece = a.promo ? { c, t: a.promo, promoted: true } : { ...x };
    n.sq[a.to] = moved; n.sq[a.from] = null;
    if (x.t === 'p' && Math.abs(rank(a.to) - rank(a.from)) === 2) n.ep = sqOf(file(a.from), (rank(a.from) + rank(a.to)) / 2);
    if (x.t === 'k') {
      n.castle.kingUnmoved[c] = false;
      if (Math.abs(file(a.to) - file(a.from)) === 2) { // castle: move the rook
        const hr = HOME_RANK[c];
        const kingside = file(a.to) === 6;
        const rf = kingside ? 7 : 0, rt = kingside ? 5 : 3;
        n.sq[sqOf(rt, hr)] = n.sq[sqOf(rf, hr)]!; n.sq[sqOf(rf, hr)] = null;
      }
    }
    // A rook leaving or being captured on a home corner stops being castling-eligible.
    for (const col of ['w', 'b'] as const) {
      const hr = HOME_RANK[col];
      for (const [fl, key] of [[7, 'k'], [0, 'q']] as const) {
        const corner = sqOf(fl, hr);
        if (a.from === corner || a.to === corner) n.castle.rookOk[col][key] = false;
      }
    }
  }
  n.turn = opp(c);
  return { pos: n, captured };
}

const sameAction = (a: Action, b: Action) =>
  a.kind === b.kind && a.to === b.to &&
  (a.kind === 'move' ? b.kind === 'move' && a.from === b.from && a.promo === b.promo : b.kind === 'drop' && a.piece === b.piece);

export { sameAction };

/** All legal actions for the side to move, given its pocket. */
export function legalActions(p: Position, pocket: Pocket, opts: Options = DEFAULT_OPTIONS): Action[] {
  const c = p.turn, out: Action[] = [];
  for (const a of [...pseudoMoves(p), ...castlingMoves(p)]) {
    const { pos } = applyUnchecked(p, a, opts);
    if (!inCheck(pos, c)) out.push(a);
  }
  for (const t of ['p', 'n', 'b', 'r', 'q'] as const) {
    if (pocket[t] <= 0) continue;
    for (let to = 0; to < 64; to++) {
      if (p.sq[to]) continue;
      if (t === 'p' && (rank(to) === 0 || rank(to) === 7)) continue;
      const a: Action = { kind: 'drop', piece: t, to };
      const { pos } = applyUnchecked(p, a, opts);
      if (!inCheck(pos, c)) out.push(a);
    }
  }
  return out;
}

export type BoardStatus = 'ok' | 'check' | 'pending' | 'mate' | 'stuck';

/**
 * Bughouse status of the side to move.
 *  - ok/check: it has a legal action.
 *  - mate: in check, no legal action, and no drop could ever block (contact, knight, pawn, double check,
 *    or a slider with no empty square between).
 *  - pending: in check, nothing legal now, but a piece dropped between could block. Not mate.
 *  - stuck: not in check, nothing legal. Never stalemate; the side waits for a piece or its flag.
 */
export function boardStatus(p: Position, pocket: Pocket, opts: Options = DEFAULT_OPTIONS): BoardStatus {
  const c = p.turn, chk = inCheck(p, c);
  if (legalActions(p, pocket, opts).length > 0) return chk ? 'check' : 'ok';
  if (!chk) return 'stuck';
  return canEverBlock(p, c) ? 'pending' : 'mate';
}

export function canEverBlock(p: Position, c: Color): boolean {
  const k = findKing(p, c);
  const cs = attackers(p, k, opp(c));
  if (cs.length !== 1) return false;
  const s = cs[0]!, x = p.sq[s]!;
  if (x.t !== 'b' && x.t !== 'r' && x.t !== 'q') return false;
  const df = Math.sign(file(k) - file(s)), dr = Math.sign(rank(k) - rank(s));
  let f = file(s) + df, r = rank(s) + dr, gaps = 0;
  while (sqOf(f, r) !== k) { if (!p.sq[sqOf(f, r)]) gaps++; f += df; r += dr; }
  return gaps > 0;
}
