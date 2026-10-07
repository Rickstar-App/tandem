// Synthesized cues (BRIEF §5.5): no audio files, so nothing to license. Default 30% gain.
import { getMuted, setMuted } from './storage.ts';

export type Cue = 'move' | 'capture' | 'drop' | 'check' | 'low' | 'end';

const TONES: Record<Cue, { f: number; to: number; ms: number; type: OscillatorType; gain: number }> = {
  move:    { f: 420, to: 420, ms: 55,  type: 'triangle', gain: 0.5 },
  capture: { f: 300, to: 180, ms: 95,  type: 'triangle', gain: 0.7 },
  drop:    { f: 620, to: 760, ms: 70,  type: 'square',   gain: 0.35 },
  check:   { f: 880, to: 880, ms: 130, type: 'sine',     gain: 0.6 },
  low:     { f: 1040, to: 760, ms: 220, type: 'sine',    gain: 0.7 },
  end:     { f: 520, to: 260, ms: 420, type: 'sine',     gain: 0.7 },
};

let ctx: AudioContext | null = null;
let muted = getMuted();

export const isMuted = () => muted;
export function toggleMute(): boolean { muted = !muted; setMuted(muted); return muted; }

/** Must be called from a user gesture on first use, or browsers keep the context suspended. */
export function wake(): void {
  if (muted) return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { ctx = null; }
}

export function play(cue: Cue, volume = 0.3): void {
  if (muted) return;
  wake();
  if (!ctx) return;
  const t = TONES[cue];
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.f, now);
  if (t.to !== t.f) osc.frequency.exponentialRampToValueAtTime(t.to, now + t.ms / 1000);
  const peak = Math.max(0.0001, volume * t.gain);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t.ms / 1000);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(now); osc.stop(now + t.ms / 1000 + 0.02);
}
