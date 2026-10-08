<script lang="ts">
  import type { Color, PieceType } from '@tandem/engine';
  let { color, type, promoted = false, size = '100%' }: {
    color: Color; type: PieceType; promoted?: boolean; size?: string;
  } = $props();
  const NAME: Record<PieceType, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
  let src = $derived(`/pieces/${color}${type}.svg`);
  let label = $derived(`${color === 'w' ? 'White' : 'Black'} ${NAME[type]}${promoted ? ', promoted' : ''}`);
</script>

<span class="piece" style:--sz={size} title={label}>
  <img {src} alt="" aria-hidden="true" draggable="false" />
  {#if promoted}
    <!-- Promoted pieces revert to pawns when captured, so they must be told apart by shape, not colour. -->
    <svg class="mark" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 0 L10 0 L0 10 Z" />
    </svg>
  {/if}
  <span class="sr-only">{label}</span>
</span>

<style>
  .piece { position: relative; display: block; width: var(--sz); height: var(--sz); }
  img { width: 100%; height: 100%; display: block; -webkit-user-drag: none; user-select: none; }
  /* Two-tone so it reads on a black piece and a white one alike, without borrowing --alert. */
  .mark { position: absolute; top: 2%; left: 2%; width: 26%; height: 26%; }
  .mark path { fill: var(--mark-fill); stroke: var(--mark-stroke); stroke-width: 1.5; }
</style>
