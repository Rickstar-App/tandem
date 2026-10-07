// Game export (BRIEF §3.10): a plain text transcript and the same data as JSON.
import type { GameRecord } from './store.ts';
import { type SeatId, tcLabel } from './types.ts';

/** `m:ss.t` for 10 s and over, `s.t` below, matching the on-screen clock. */
export function clockText(ms: number): string {
  const v = Math.max(0, ms);
  if (v < 10_000) return (Math.floor(v / 100) / 10).toFixed(1);
  const total = Math.floor(v / 100) / 10;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function toText(rec: GameRecord): string {
  const head = [
    `[Event "Tandem bughouse"]`,
    `[Date "${new Date(rec.endedAt).toISOString().slice(0, 10)}"]`,
    `[Result "${rec.result.winner ?? 'draw'}"]`,
    `[TimeControl "${tcLabel(rec.tc)}"]`,
    `[TeamWhiteA "${rec.players.WA}"]`,
    `[TeamBlackA "${rec.players.BA}"]`,
  ];
  const lines = rec.ply.map(p => {
    const seat = `${p.board}-${p.color}` as SeatId;
    return `${p.board}.${p.color} ${p.san} {${clockText(p.clocks[seat])}}`;
  });
  return [...head, '', ...lines, '', rec.result.text, ''].join('\n');
}

export function toJson(rec: GameRecord): string {
  return JSON.stringify({
    event: 'Tandem bughouse',
    date: new Date(rec.endedAt).toISOString(),
    timeControl: tcLabel(rec.tc),
    players: rec.players,
    result: rec.result,
    finalFen: rec.finalFen,
    ply: rec.ply.map(p => ({
      n: p.n, board: p.board, color: p.color, san: p.san,
      action: p.action, serverTs: p.serverTs, clocks: p.clocks,
      fen: p.fen, ...(p.transfer ? { transfer: p.transfer } : {}),
    })),
  }, null, 2);
}
