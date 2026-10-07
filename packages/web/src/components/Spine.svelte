<script lang="ts">
  import type { Board, DropType, Color } from '@tandem/engine';
  import Piece from './Piece.svelte';

  /** A capture crossing to the partner board: the mechanic made visible (BRIEF §5.2). */
  let { transfer = null, horizontal = false, compact = false }: {
    transfer?: { toBoard: Board; color: Color; piece: DropType; key: number } | null;
    horizontal?: boolean;
    compact?: boolean;
  } = $props();
</script>

<div class="spine" class:horizontal class:compact aria-hidden="true">
  {#if transfer}
    {#key transfer.key}
      <div class="travel" class:to-b={transfer.toBoard === 'B'} class:to-a={transfer.toBoard === 'A'}>
        <Piece color={transfer.color} type={transfer.piece} size="28px" />
        <small>to {transfer.toBoard}</small>
      </div>
    {/key}
  {/if}
</div>

<style>
  .spine { position: relative; align-self: stretch; display: grid; place-items: center; min-width: var(--spine-w); }
  .spine::before { content: ""; position: absolute; top: 0; bottom: 0; width: 1px; background: var(--rule); }
  .horizontal { min-width: 0; height: var(--spine-w); }
  .horizontal.compact { height: 24px; }
  .horizontal::before { top: 50%; bottom: auto; left: 0; right: 0; width: auto; height: 1px; }
  .travel {
    position: relative; z-index: 1;
    display: grid; justify-items: center; gap: 2px;
    background: var(--page); padding: var(--s-1) 0;
    font-size: var(--fs-small); color: var(--ink-2);
  }
  .to-b { animation: cross-right var(--t-transfer) var(--ease-out); }
  .to-a { animation: cross-left var(--t-transfer) var(--ease-out); }
  @keyframes cross-right {
    from { transform: translateX(-120%); opacity: 0; }
    60% { opacity: 1; }
    to { transform: translateX(120%); opacity: 0; }
  }
  @keyframes cross-left {
    from { transform: translateX(120%); opacity: 0; }
    60% { opacity: 1; }
    to { transform: translateX(-120%); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .travel { display: none; }
  }
</style>
