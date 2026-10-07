<script lang="ts">
  import { formatClock, speakClock } from '../lib/clock.ts';
  let { ms, running = false, low = false, label }: {
    ms: number; running?: boolean; low?: boolean; label: string;
  } = $props();
</script>

<!--
  Running: dark ground. Low: solid alert ground at weight 800. No pulsing (DESIGN.md).
  The numerals are decorative to a screen reader; the spoken form is the real text, so no
  aria-label sits on a bare element (which ARIA prohibits).
-->
<div class="clock" class:running class:low>
  <span aria-hidden="true">{formatClock(ms)}</span>
  <span class="sr-only">{label}: {speakClock(ms)}</span>
</div>

<style>
  .clock {
    font-family: var(--font-ui);
    font-weight: var(--fw-clock);
    font-variant-numeric: tabular-nums;
    font-size: var(--fs-clock);
    line-height: 1;
    letter-spacing: -.01em;
    padding: var(--s-1) var(--s-2);
    border-radius: var(--radius);
    white-space: nowrap;
  }
  .running { background: var(--clock-run-bg); color: var(--clock-run-ink); }
  .low { background: var(--alert); color: var(--on-alert); font-weight: var(--fw-clock-low); }
</style>
