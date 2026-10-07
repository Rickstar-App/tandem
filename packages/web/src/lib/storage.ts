// Per-browser preferences (BRIEF §4.1, §5.5). Never anything the server needs to trust.
const KEY = { name: 'tandem.name', mute: 'tandem.mute', seat: (id: string) => `tandem.seat.${id}` };

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export const getName = () => read(KEY.name) ?? '';
export const setName = (n: string) => write(KEY.name, n);
export const getMuted = () => read(KEY.mute) === '1';
export const setMuted = (m: boolean) => write(KEY.mute, m ? '1' : '0');
export const getSeatToken = (id: string) => read(KEY.seat(id)) ?? undefined;
export const setSeatToken = (id: string, t: string) => write(KEY.seat(id), t);
