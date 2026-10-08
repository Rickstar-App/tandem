<script lang="ts">
  import type { Board, Color, DropType, Pocket } from '@tandem/engine';
  import Clock from './Clock.svelte';
  import Reserve from './Reserve.svelte';

  let {
    board, color, name, connected = true, pocket, ms, running = false, low = false,
    mine = false, interactive = false, selected = $bindable(null), justGained = null, compact = false,
  }: {
    board: Board; color: Color; name: string; connected?: boolean;
    pocket: Pocket; ms: number; running?: boolean; low?: boolean;
    mine?: boolean; interactive?: boolean; selected?: DropType | null; justGained?: DropType | null;
    /** Tighter row for the mini board in focus mode; the clock and reserve stay visible. */
    compact?: boolean;
  } = $props();

  const label = $derived(`Board ${board}, ${name}, ${color === 'w' ? 'White' : 'Black'}`);
</script>

<div class="strip" class:compact>
  <div class="who">
    <span class="badge" class:b={board === 'B'} aria-hidden="true">{board}</span>
    <span class="name" title={name}>{name}</span>
    <span class="seat small muted">{color === 'w' ? 'White' : 'Black'}</span>
    {#if !connected}<span class="away small" title="Disconnected">away</span>{/if}
  </div>
  <Reserve {pocket} {color} {interactive} bind:selected {mine} {justGained} />
  <Clock {ms} {running} {low} {label} />
</div>

<style>
  .strip {
    display: grid;
    grid-template-columns: minmax(0, auto) 1fr auto;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) 0;
    min-height: var(--strip-h);
  }
  .who { display: flex; align-items: center; gap: var(--s-2); min-width: 0; }
  .badge {
    flex: none; width: var(--badge); height: var(--badge); display: grid; place-items: center;
    background: var(--a-accent); color: var(--on-accent);
    border-radius: var(--radius); font-weight: 800; font-size: var(--fs-small);
  }
  .badge.b { background: var(--b-accent); }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 14ch; }
  .away { color: var(--alert); font-weight: 800; }
  .compact { min-height: var(--strip-h-compact); gap: var(--s-2); font-size: var(--fs-small); }
  .compact :global(.clock) { font-size: 1.125rem; }
  .compact .seat { display: none; }
  @media (max-width: 1099px) {
    .strip { min-height: var(--strip-h-compact); gap: var(--s-2); }
    .name { max-width: 9ch; }
    .seat { display: none; }
  }
</style>
