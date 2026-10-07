<script lang="ts">
  import type { Board } from '@tandem/engine';
  import type { PlyRecord, SeatId } from '@tandem/server';
  import { formatClock } from '../lib/clock.ts';

  let { ply, open = $bindable(false), current = -1, onSeek = null }: {
    ply: PlyRecord[];
    open?: boolean;
    /** Index of the ply being shown, for replay. -1 means live. */
    current?: number;
    onSeek?: ((i: number) => void) | null;
  } = $props();

  let filter = $state<'all' | Board>('all');
  const shown = $derived(ply.filter(p => filter === 'all' || p.board === filter));
</script>

<section class="movelist">
  <button class="head quiet" aria-expanded={open} onclick={() => (open = !open)}>
    <span>{open ? 'Hide' : 'Show'} moves</span>
    <span class="muted small">{ply.length}</span>
  </button>

  {#if open}
    <div class="filters" role="group" aria-label="Filter by board">
      {#each ['all', 'A', 'B'] as const as f}
        <button class="quiet chip" class:on={filter === f} onclick={() => (filter = f)} aria-pressed={filter === f}>
          {f === 'all' ? 'Both boards' : `Board ${f}`}
        </button>
      {/each}
    </div>
    <ol class="rows">
      {#each shown as p (p.n)}
        {@const seat = `${p.board}-${p.color}` as SeatId}
        <li class:now={current === p.n - 1}>
          {#if onSeek}
            <button class="row" onclick={() => onSeek?.(p.n - 1)}>
              <span class="n">{p.n}</span>
              <span class="bd" class:b={p.board === 'B'}>{p.board}</span>
              <span class="san">{p.san}</span>
              <span class="t muted">{formatClock(p.clocks[seat])}</span>
            </button>
          {:else}
            <span class="row static">
              <span class="n">{p.n}</span>
              <span class="bd" class:b={p.board === 'B'}>{p.board}</span>
              <span class="san">{p.san}</span>
              <span class="t muted">{formatClock(p.clocks[seat])}</span>
            </span>
          {/if}
        </li>
      {:else}
        <li class="muted small empty">No moves yet.</li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .movelist { border-top: 1px solid var(--rule); margin-top: var(--s-3); }
  .head { display: flex; justify-content: space-between; width: 100%; border: 0; padding: var(--s-2) 0; }
  .head:hover:not(:disabled) { background: none; text-decoration: underline; }
  .filters { display: flex; gap: var(--s-1); margin-bottom: var(--s-2); }
  .chip { min-height: 32px; padding: var(--s-1) var(--s-2); font-size: var(--fs-small); }
  .chip.on { background: var(--ink); color: var(--page); border-color: var(--ink); }
  .rows { list-style: none; margin: 0; padding: 0; max-height: 38vh; overflow: auto; }
  .rows li + li { border-top: 1px solid var(--rule); }
  .row {
    display: grid; grid-template-columns: 3ch 2ch 1fr auto; gap: var(--s-2);
    align-items: baseline; width: 100%; text-align: left;
    background: none; color: inherit; border: 0; border-radius: 0;
    padding: var(--s-1) var(--s-2); min-height: 32px; font-size: var(--fs-small);
  }
  .row.static { cursor: default; }
  button.row:hover { background: var(--panel); }
  .now > .row { background: var(--panel); font-weight: 800; }
  .n { color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .bd { color: var(--a-accent); font-weight: 800; }
  .bd.b { color: var(--b-accent); }
  .san { font-variant-numeric: tabular-nums; }
  .t { font-variant-numeric: tabular-nums; }
  .empty { padding: var(--s-2); }
</style>
