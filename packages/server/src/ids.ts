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
