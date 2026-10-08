<script lang="ts">
  import { untrack } from 'svelte';
  import type { ClientMsg, RoomSnapshot, Team, TimeControl } from '@tandem/server';
  import { setName } from '../lib/storage.ts';

  let { room, myTeam, id, send, myName = $bindable('') }: {
    room: RoomSnapshot; myTeam: Team | null; id: string;
    send: (m: ClientMsg | { type: string; [k: string]: unknown }) => void;
    myName?: string;
  } = $props();

  const PRESETS: TimeControl[] = [
    { baseMin: 1, incSec: 0 }, { baseMin: 2, incSec: 0 }, { baseMin: 3, incSec: 0 },
    { baseMin: 5, incSec: 0 }, { baseMin: 10, incSec: 0 }, { baseMin: 3, incSec: 2 },
  ];
  const label = (t: TimeControl) => `${t.baseMin}+${t.incSec}`;
  // The server names the host; it also enforces the rule, so this only decides what to show.
  const isHost = $derived(myTeam !== null && room.host === myTeam);

  const both = $derived(!!room.players.WA && !!room.players.BA);
  const link = $derived(`${location.origin}/t/${id}`);
  let copied = $state(false);

  let nowMs = $state(Date.now());
  $effect(() => {
    if (room.phase !== 'countdown') return;
    const t = setInterval(() => (nowMs = Date.now()), 200);
    return () => clearInterval(t);
  });
  const countdown = $derived(room.phase === 'countdown' && room.startAt
    ? Math.max(0, Math.ceil((room.startAt - nowMs) / 1000)) : null);

  async function copy() {
    try { await navigator.clipboard.writeText(link); copied = true; setTimeout(() => (copied = false), 2000); }
    catch { copied = false; }
  }

  let renameTimer: ReturnType<typeof setTimeout> | null = null;
  function rename(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    myName = v; setName(v);
    // Debounced so a burst of keystrokes does not trip the message rate limit.
    if (renameTimer) clearTimeout(renameTimer);
    renameTimer = setTimeout(() => send({ type: 'rename', name: v }), 250);
  }
  $effect(() => () => { if (renameTimer) clearTimeout(renameTimer); });
  // These mirror the table's current setting, so pressing Set never quietly undoes the preset
  // you just picked. They follow a real change to the time control and nothing else: syncing on
  // every snapshot would overwrite digits while you were still typing them.
  let customBase = $state(0);
  let customInc = $state(0);
  let syncedTc = '';
  $effect(() => {
    const key = `${room.tc.baseMin}+${room.tc.incSec}`;
    if (key === syncedTc) return;
    syncedTc = key;
    untrack(() => { customBase = room.tc.baseMin; customInc = room.tc.incSec; });
  });
</script>

<section class="lobby">
  {#if room.phase === 'countdown'}
    <h1>Starting in {countdown}</h1>
    <p class="muted">White moves first on both boards.</p>
  {:else}
    <h1>Table {id}</h1>

    <div class="seats">
      {#each ['WA', 'BA'] as const as t}
        {@const p = room.players[t]}
        <div class="seat" class:you={myTeam === t}>
          <h2>{t === 'WA' ? 'White-A' : 'Black-A'}</h2>
          <p class="small muted">{t === 'WA' ? 'White on A, Black on B' : 'Black on A, White on B'}</p>
          <p class="who">
            {#if p}{p.name}{#if myTeam === t}<span class="small muted you">(you)</span>{/if}
            {:else}<span class="muted">waiting…</span>{/if}
          </p>
          {#if p}
            <p class="small" class:ready={room.ready[t]}>{room.ready[t] ? 'Ready' : 'Not ready'}</p>
          {/if}
        </div>
      {/each}
    </div>

    {#if !both}
      <div class="invite">
        <label for="invite">Send this link to your opponent</label>
        <div class="row">
          <input id="invite" type="text" readonly value={link} onclick={(e) => (e.target as HTMLInputElement).select()} />
          <button onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
    {/if}

    {#if myTeam}
      <div class="field">
        <label for="name">Your name</label>
        <input id="name" type="text" maxlength="20" value={myName} oninput={rename} placeholder="Guest" />
      </div>

      {#if isHost}
        <fieldset class="tc">
          <legend>Time control</legend>
          <div class="chips">
            {#each PRESETS as t (label(t))}
              <button
                class="quiet chip"
                class:on={room.tc.baseMin === t.baseMin && room.tc.incSec === t.incSec}
                aria-pressed={room.tc.baseMin === t.baseMin && room.tc.incSec === t.incSec}
                onclick={() => send({ type: 'setup', tc: t })}
              >{label(t)}</button>
            {/each}
          </div>
          <div class="row custom">
            <label for="base">Custom</label>
            <input id="base" type="number" min="1" max="30" bind:value={customBase} aria-label="Minutes" />
            <span aria-hidden="true">+</span>
            <input id="inc" type="number" min="0" max="10" bind:value={customInc} aria-label="Increment seconds" />
            <button class="quiet" onclick={() => send({ type: 'setup', tc: { baseMin: Number(customBase), incSec: Number(customInc) } })}>Set</button>
          </div>
        </fieldset>

        <fieldset class="tc">
          <legend>Your team</legend>
          <div class="chips">
            {#each [['WA', 'White-A'], ['BA', 'Black-A'], ['random', 'Random']] as const as [v, l]}
              <button
                class="quiet chip"
                class:on={room.hostTeam === v}
                aria-pressed={room.hostTeam === v}
                onclick={() => send({ type: 'setup', team: v })}
              >{l}</button>
            {/each}
          </div>
          {#if room.hostTeam === 'random'}<p class="small muted">Decided when the game starts.</p>{/if}
        </fieldset>
      {:else}
        <p class="small muted">Time control {label(room.tc)}, set by your opponent.</p>
      {/if}

      <button
        class="ready"
        disabled={!both}
        onclick={() => send({ type: 'ready', value: !room.ready[myTeam] })}
      >{room.ready[myTeam] ? 'Not ready' : 'Ready'}</button>
      {#if !both}<p class="small muted">Both players must be here before you can start.</p>{/if}
    {:else}
      <p class="muted">You are watching. The players are setting up.</p>
    {/if}
  {/if}
</section>

<style>
  .lobby { max-width: 640px; }
  .seats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--s-4); margin-bottom: var(--s-5); }
  .seat { border: 1px solid var(--rule); padding: var(--s-3); }
  .seat.you { border-left: 3px solid var(--ink); }
  .seat h2 { margin-bottom: 2px; }
  .seat .who { margin: var(--s-2) 0 0; font-weight: 800; }
  /* A margin, not a leading space: the compiler is free to trim whitespace in markup. */
  .you { margin-left: var(--s-1); font-weight: 400; }
  /* Ready is the primary action; it reads as one by being a filled button, not by colour. */
  .ready { font-weight: 800; }
  .invite { margin-bottom: var(--s-4); }
  .row { display: flex; gap: var(--s-2); align-items: center; }
  .row input[type="text"] { flex: 1; min-width: 0; }
  .field { margin-bottom: var(--s-4); display: grid; gap: var(--s-1); max-width: 320px; }
  label { font-size: var(--fs-small); color: var(--ink-2); }
  fieldset.tc { border: 0; border-top: 1px solid var(--rule); padding: var(--s-3) 0 0; margin: 0 0 var(--s-4); }
  legend { font-size: var(--fs-small); color: var(--ink-2); padding: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: var(--s-1); margin-bottom: var(--s-2); }
  .chip { min-height: 36px; padding: var(--s-1) var(--s-3); font-variant-numeric: tabular-nums; }
  .chip.on { background: var(--ink); color: var(--page); border-color: var(--ink); }
  .custom input[type="number"] { width: 5rem; }
  button.ready { min-width: 140px; }
</style>
