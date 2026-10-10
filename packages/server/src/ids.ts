// Unguessable ids (BRIEF §6.6). 8 chars from a 32-symbol alphabet with no look-alikes = 40 bits.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32: no i, l, o, u

export interface Rng { (buf: Uint8Array): void }
export const webRng: Rng = (buf) => { (globalThis.crypto as Crypto).getRandomValues(buf); };

export function tableId(rng: Rng = webRng): string {
  const b = new Uint8Array(8); rng(b);
  return Array.from(b, x => ALPHABET[x & 31]!).join('');
}

/** 128-bit seat token as 32 hex chars. */
export function seatToken(rng: Rng = webRng): string {
  const b = new Uint8Array(16); rng(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export const isTableId = (s: unknown): s is string =>
  typeof s === 'string' && s.length === 8 && [...s].every(c => ALPHABET.includes(c));

// A readable name for a table. Purely cosmetic: the id in the URL keeps all of its
// entropy (§6.6), and this is derived from it, so nothing about guessability changes.
// Two tables can share a name; the URL is what identifies them.
const ADJECTIVES = [
  'Amber', 'Brass', 'Quiet', 'Iron', 'Slate', 'Clay', 'Teal', 'Copper',
  'Patient', 'Crooked', 'Open', 'Narrow', 'Steady', 'Sudden', 'Long', 'Short',
  'Northern', 'Ruined', 'Gilded', 'Plain', 'Hollow', 'Bright', 'Still', 'Rough',
  'Clever', 'Blunt', 'Hidden', 'Crowded', 'Empty', 'Late', 'Early', 'Winter',
  'Idle', 'Restless', 'Sober', 'Reckless', 'Grand', 'Humble', 'Sharp', 'Soft',
  'Lucky', 'Stubborn', 'Honest', 'Quick', 'Slow', 'Wandering', 'Silent', 'Loud',
  'Golden', 'Rusted', 'Painted', 'Weathered', 'Folded', 'Crossed', 'Tilted', 'Even',
  'Odd', 'Doubled', 'Isolated', 'Passed', 'Backward', 'Central', 'Outside', 'Inside',
];
const NOUNS = [
  'Gambit', 'Rook', 'Knight', 'Bishop', 'Pawn', 'Castle', 'Endgame', 'Opening',
  'Tempo', 'Blunder', 'Sacrifice', 'Fork', 'Pin', 'Skewer', 'Zugzwang', 'Fianchetto',
  'Clock', 'Flag', 'Reserve', 'Exchange', 'Promotion', 'Stalemate', 'Check', 'Mate',
  'Table', 'Board', 'Square', 'File', 'Rank', 'Diagonal', 'Corner', 'Centre',
  'Attack', 'Defence', 'Counter', 'Trap', 'Net', 'Fortress', 'Breakthrough', 'Push',
  'Swindle', 'Gambler', 'Novice', 'Veteran', 'Patzer', 'Hustler', 'Regular', 'Stranger',
  'Cafe', 'Parlour', 'Club', 'Bar', 'Corner Shop', 'Back Room', 'Window Seat', 'Last Round',
  'Night Shift', 'Long Game', 'Short Draw', 'Quick Loss', 'Close Call', 'Near Thing', 'Open File', 'Spare Queen',
];

/** Deterministic, so the same table always reads the same way on every screen. */
export function tableName(id: string): string {
  let a = 0, b = 0;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    if (i % 2 === 0) a = (a * 31 + c) >>> 0;
    else b = (b * 37 + c) >>> 0;
  }
  return `The ${ADJECTIVES[a % ADJECTIVES.length]} ${NOUNS[b % NOUNS.length]}`;
}
