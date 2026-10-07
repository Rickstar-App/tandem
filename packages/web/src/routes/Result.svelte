<script lang="ts">
  import type { ClientMsg, RoomSnapshot, Team } from '@tandem/server';

  let { room, myTeam, send, id }: {
    room: RoomSnapshot; myTeam: Team | null;
    send: (m: ClientMsg | { type: string; [k: string]: unknown }) => void;
    id: string;
  } = $props();

  const r = $derived(room.result!);
  const theyAsked = $derived(room.rematch && room.rematch.by !== myTeam);
  const youAsked = $derived(room.rematch && room.rematch.by === myTeam);
</script>

<section class="result" role="status">
  <h1>{r.text}</h1>
  <div class="row">
    {#if myTeam}
      <button onclick={() => send({ type: 'rematch' })} disabled={!!youAsked}>
        {theyAsked ? 'Accept rematch' : youAsked ? 'Rematch offered' : 'Rematch'}
      </button>
      {#if theyAsked}<span class="small muted">Your opponent wants another game. Teams swap.</span>{/if}
    {/if}
    <a class="btnish" href={`/g/${id}`}>Replay</a>
    <a class="btnish" href={`/api/game/${id}.txt`} download>Download text</a>
    <a class="btnish" href={`/api/game/${id}.json`} download>Download JSON</a>
  </div>
</section>

<style>
  .result {
    border: 1px solid var(--rule); border-left: 3px solid var(--ink);
    padding: var(--s-3) var(--s-4); margin-bottom: var(--s-4);
  }
  .result h1 { font-size: 1.25rem; margin-bottom: var(--s-3); }
  .row { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
  .btnish {
    display: inline-flex; align-items: center; min-height: 40px;
    padding: var(--s-2) var(--s-4);
    border: 1px solid var(--rule); border-radius: var(--radius);
    text-decoration: none;
  }
  .btnish:hover { background: var(--panel); color: var(--ink); }
</style>
