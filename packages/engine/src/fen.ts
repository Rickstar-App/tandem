import { type Color, type DropType, type Piece, type PieceType, type Pocket, type Position, emptyPocket, parseSq, sqOf } from './board.ts';

/** Crazyhouse-style FEN: `board[pockets] turn castling ep`. A `~` after a piece marks it promoted. */
export function parseFen(fen: string): { pos: Position; pockets: Record<Color, Pocket> } {
  const m = fen.trim().match(/^(\S+?)(?:\[([A-Za-z]*)\])?\s+([wb])\s+(\S+)\s+(\S+)/);
  if (!m) throw new Error('bad fen: ' + fen);
  const [, boardPart, pocketPart = '', turn, castling, ep] = m as unknown as string[];
  const sq: (Piece | null)[] = Array(64).fill(null);
  const rows = boardPart!.split('/');
  if (rows.length !== 8) throw new Error('bad fen rows');
  rows.forEach((row, i) => {
    const r = 7 - i; let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      if (ch === '~') { const x = sq[sqOf(f - 1, r)]!; x.promoted = true; continue; }
      const c: Color = ch === ch.toUpperCase() ? 'w' : 'b';
      sq[sqOf(f++, r)] = { c, t: ch.toLowerCase() as PieceType };
    }
  });
  const pockets = { w: emptyPocket(), b: emptyPocket() };
  for (const ch of pocketPart) {
    const c: Color = ch === ch.toUpperCase() ? 'w' : 'b';
    pockets[c][ch.toLowerCase() as DropType]++;
  }
  const has = (x: string) => castling!.includes(x);
  const pos: Position = {
    sq, turn: turn as Color, ep: ep === '-' ? -1 : parseSq(ep!),
    castle: {
      kingUnmoved: { w: has('K') || has('Q'), b: has('k') || has('q') },
      rookOk: { w: { k: has('K'), q: has('Q') }, b: { k: has('k'), q: has('q') } },
    },
  };
  return { pos, pockets };
}

export function toFen(pos: Position, pockets: Record<Color, Pocket>): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', empty = 0;
    for (let f = 0; f < 8; f++) {
      const x = pos.sq[sqOf(f, r)];
      if (!x) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      const ch = x.c === 'w' ? x.t.toUpperCase() : x.t;
      row += ch + (x.promoted ? '~' : '');
    }
    rows.push(row + (empty || ''));
  }
  const pk = (c: Color) => (['q', 'r', 'b', 'n', 'p'] as DropType[]).map(t => (c === 'w' ? t.toUpperCase() : t).repeat(pockets[c][t])).join('');
  const cs = (pos.castle.kingUnmoved.w && pos.castle.rookOk.w.k ? 'K' : '') + (pos.castle.kingUnmoved.w && pos.castle.rookOk.w.q ? 'Q' : '')
    + (pos.castle.kingUnmoved.b && pos.castle.rookOk.b.k ? 'k' : '') + (pos.castle.kingUnmoved.b && pos.castle.rookOk.b.q ? 'q' : '');
  const ep = pos.ep < 0 ? '-' : 'abcdefgh'[pos.ep & 7]! + ((pos.ep >> 3) + 1);
  return `${rows.join('/')}[${pk('w')}${pk('b')}] ${pos.turn} ${cs || '-'} ${ep} 0 1`;
}
