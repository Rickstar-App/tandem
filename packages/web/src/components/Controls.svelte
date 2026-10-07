<script lang="ts">
  import type { RoomSnapshot, Team } from '@tandem/server';
  import Confirm from './Confirm.svelte';
  import { isMuted, toggleMute } from '../lib/sound.ts';

  let { room, myTeam, send }: {
    room: RoomSnapshot;
    myTeam: Team;
    send: (m: { type: string; [k: string]: unknown }) => void;
  } = $props();

  let muted = $state(isMuted());
  const offerFromThem = $derived(room.drawOffer && room.drawOffer.by !== myTeam ? room.drawOffer : null);
  const offerFromMe = $derived(room.drawOffer && room.drawOffer.by === myTeam ? room.drawOffer : null);
  const live = $derived(room.phase === 'playing');
</script>

<div class="controls">
  {#if offerFromThem}
    <div class="offer" role="status">
      <span>Your opponent offers a draw.</span>
      <button onclick={() => send({ type: 'drawAccept' })}>Accept</button>
      <button class="quiet" onclick={() => send({ type: 'drawDecline' })}>Decline</button>
    </div>
  {/if}

  <div class="row">
    <Confirm
      label="Resign"
      confirmLabel="Confirm resign"
      disabled={!live}
      onConfirm={() => send({ type: 'resign' })}
    />
    <Confirm
      label={offerFromMe ? 'Draw offered' : 'Offer draw'}
      confirmLabel="Confirm draw offer"
      danger={false}
      disabled={!live || !!room.drawOffer}
      onConfirm={() => send({ type: 'drawOffer' })}
    />
    {#if room.claimable[myTeam]}
      <!-- Only shown once the server says the opponent has been gone 60 s (BRIEF §6.5). -->
      <button onclick={() => send({ type: 'claimWin' })}>Claim win</button>
    {/if}
    <button
      class="quiet"
      aria-pressed={muted}
      onclick={() => { muted = toggleMute(); }}
    >{muted ? 'Sound off' : 'Sound on'}</button>
  </div>
</div>

<style>
  .controls { margin-top: var(--s-3); }
  .row { display: flex; flex-wrap: wrap; gap: var(--s-2); }
  .offer {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2);
    border: 1px solid var(--rule); border-left: 3px solid var(--alert);
    padding: var(--s-2) var(--s-3); margin-bottom: var(--s-3);
  }
</style>
