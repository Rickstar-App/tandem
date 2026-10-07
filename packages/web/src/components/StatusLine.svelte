<script lang="ts">
  import type { Board } from '@tandem/engine';
  import type { RoomSnapshot } from '@tandem/server';
  import { statusWords } from '../lib/view.ts';

  let { room, yourTurn = { A: false, B: false } }: {
    room: RoomSnapshot;
    yourTurn?: Record<Board, boolean>;
  } = $props();
  const BOARDS: Board[] = ['A', 'B'];
</script>

<!-- One line per board, in words, because colour alone never carries state (DESIGN.md). -->
<div class="status">
  {#each BOARDS as b (b)}
    {@const st = room.status[b]}
    {@const warn = st === 'check' || st === 'pending' || st === 'mate'}
    <p>
      <b>Board {b}:</b>
      <span class:warn>{statusWords(st, room.turn[b])}</span>
      {#if yourTurn[b] && room.phase === 'playing'}<span class="yours">your move</span>{/if}
    </p>
  {/each}
</div>

<style>
  .status {
    display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-5);
    border-top: 1px solid var(--rule);
    padding-top: var(--s-3); margin-top: var(--s-3);
    font-size: var(--fs-small); color: var(--ink-2);
  }
  .status p { margin: 0; }
  .status b { color: var(--ink); }
  .warn { color: var(--alert); font-weight: 800; }
  .yours { color: var(--ink); font-weight: 800; }
</style>
