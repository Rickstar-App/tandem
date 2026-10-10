<script lang="ts">
  import type { Color, DropType, Pocket } from '@tandem/engine';
  import Piece from './Piece.svelte';

  let { pocket, color, interactive = false, selected = $bindable(null), mine = false, justGained = null, compact = false }: {
    pocket: Pocket;
    color: Color;
    interactive?: boolean;
    selected?: DropType | null;
    /** Your own reserve is drawn larger; the opponent's stays visible as tactical information. */
    mine?: boolean;
    justGained?: DropType | null;
    /** The mini board in focus mode, where vertical space is scarce. */
    compact?: boolean;
  } = $props();

  const ORDER: DropType[] = ['q', 'r', 'b', 'n', 'p'];
  const held = $derived(ORDER.filter(t => pocket[t] > 0));
  const NAME: Record<DropType, string> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

  function pick(t: DropType) {
    if (!interactive) return;
    selected = selected === t ? null : t;
  }
</script>

<div class="reserve" class:mine class:compact>
  <span class="sr-only">{color === 'w' ? 'White' : 'Black'} reserve</span>
  {#if !held.length}
    <span class="empty small muted">empty</span>
  {/if}
  {#each held as t (t)}
    <button
      type="button"
      class="slot"
      class:picked={selected === t}
      class:gained={justGained === t}
      disabled={!interactive}
      draggable={interactive}
      ondragstart={(e) => { e.dataTransfer?.setData('text/plain', `@${t}`); selected = t; }}
      onclick={() => pick(t)}
      aria-pressed={interactive ? selected === t : undefined}
      aria-label={`${pocket[t]} ${NAME[t]}${pocket[t] > 1 ? 's' : ''} in reserve`}
    >
      <Piece {color} type={t} />
      {#if pocket[t] > 1}<b class="count" aria-hidden="true">{pocket[t]}</b>{/if}
    </button>
  {/each}
</div>

<style>
  .reserve { display: flex; align-items: center; gap: var(--s-1); min-height: 32px; flex-wrap: wrap; --slot: var(--reserve-slot-opp); }
  .mine { --slot: var(--reserve-slot); }
  .compact, .compact.mine { --slot: var(--reserve-slot-mini); gap: 2px; }
  .empty { padding-inline: var(--s-1); }
  .slot {
    position: relative; width: var(--slot); height: var(--slot);
    padding: 0; min-height: 0; background: none; border: 1px solid transparent; border-radius: var(--radius);
  }
  .slot:disabled { opacity: 1; cursor: default; }
  .slot:not(:disabled):hover { border-color: var(--rule); background: var(--panel); }
  .picked { border-color: var(--ink); background: var(--panel); }
  .count {
    position: absolute; right: -3px; bottom: -3px;
    font-size: 12px; font-weight: 800; line-height: 1;
    background: var(--ink); color: var(--page);
    border-radius: 9px; min-width: 17px; height: 17px;
    display: grid; place-items: center; padding: 0 3px;
  }
  /* Under reduced motion the spine does not animate, so the arriving piece is highlighted instead. */
  .gained { animation: gained var(--t-transfer) var(--ease-out); }
  @keyframes gained {
    from { box-shadow: inset 0 0 0 2px var(--alert); }
    to { box-shadow: inset 0 0 0 0 transparent; }
  }
</style>
