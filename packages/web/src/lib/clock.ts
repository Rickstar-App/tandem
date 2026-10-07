// Clock display and interpolation (BRIEF §3.7). The server owns the truth; this only renders it.
import type { SeatId } from '@tandem/server';

/** `m:ss` at 10 s and over, `s.t` below. */
export function formatClock(ms: number): string {
  const v = Math.max(0, ms);
  if (v < 10_000) return (Math.floor(v / 100) / 10).toFixed(1);
  const total = Math.ceil(v / 1000);
  const m = Math.floor(total / 60);
  return `${m}:${String(total - m * 60).padStart(2, '0')}`;
}

/** Spoken form for the live region, so a screen reader does not read "3:07" as a ratio. */
export function speakClock(ms: number): string {
  const v = Math.max(0, ms);
  if (v < 10_000) return `${(Math.floor(v / 100) / 10).toFixed(1)} seconds`;
  const total = Math.ceil(v / 1000);
  const m = Math.floor(total / 60), s = total - m * 60;
  if (!m) return `${s} seconds`;
  return `${m} minute${m === 1 ? '' : 's'} ${s} second${s === 1 ? '' : 's'}`;
}

export interface ClockView { ms: number; running: boolean; low: boolean }

/** Remaining time for each seat at wall-clock `now`, interpolated from the last server settle. */
export function interpolate(
  clocks: Record<SeatId, number>, clocksAt: number, running: SeatId[], now: number, lowTimeMs: number,
): Record<SeatId, ClockView> {
  const out = {} as Record<SeatId, ClockView>;
  for (const seat of Object.keys(clocks) as SeatId[]) {
    const isRunning = running.includes(seat);
    const ms = Math.max(0, clocks[seat] - (isRunning ? Math.max(0, now - clocksAt) : 0));
    out[seat] = { ms, running: isRunning, low: isRunning && ms <= lowTimeMs };
  }
  return out;
}
