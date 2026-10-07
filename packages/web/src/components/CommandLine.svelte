<script lang="ts">
  import { type Action, type Board, type Game, legalWithSan, parseSan } from '@tandem/engine';
  import { colorOn } from '../lib/view.ts';
  import type { Team } from '@tandem/server';

  let { game, myTeam, enabled = true, onAct }: {
    game: Game;
    myTeam: Team;
    enabled?: boolean;
    onAct: (b: Board, a: Action) => void;
  } = $props();

  let value = $state('');
  let msg = $state('');
  let input = $state<HTMLInputElement | null>(null);

  const myBoards = $derived((['A', 'B'] as Board[]).filter(b => game.pos[b].turn === colorOn(myTeam, b)));

  /** Suggestions come from the legal-action list, so the line can never propose an illegal move. */
  const suggestions = $derived.by(() => {
    const raw = value.trim();
    if (!raw) return [];
    const m = /^([abAB])\s+(.*)$/.exec(raw);
    const boards = m ? [m[1]!.toUpperCase() as Board] : myBoards;
    const text = (m ? m[2]! : raw).toLowerCase();
    const out: { board: Board; san: string }[] = [];
    for (const b of boards) {
      if (!myBoards.includes(b)) continue;
      for (const { san } of legalWithSan(game, b)) {
        if (san.toLowerCase().startsWith(text)) out.push({ board: b, san });
      }
    }
    return out.slice(0, 8);
  });

  export function focus() { input?.focus(); }

  function submit(e: Event) {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    const m = /^([abAB])\s+(.+)$/.exec(raw);
    const text = m ? m[2]! : raw;
    const boards = m ? [m[1]!.toUpperCase() as Board] : myBoards;

    const hits: { board: Board; action: Action }[] = [];
    for (const b of boards) {
      if (!myBoards.includes(b)) continue;
      const a = parseSan(game, b, text);
      if (a) hits.push({ board: b, action: a });
    }
    if (hits.length === 1) { onAct(hits[0]!.board, hits[0]!.action); value = ''; msg = ''; return; }
    if (hits.length > 1) { msg = 'legal on A and B, add a or b'; return; }
    msg = myBoards.length ? 'no legal move matches' : 'not your move on either board';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { value = ''; msg = ''; input?.blur(); }
    if (e.key === 'Tab' && suggestions.length) {
      e.preventDefault();
      const s = suggestions[0]!;
      value = myBoards.length > 1 ? `${s.board.toLowerCase()} ${s.san}` : s.san;
    }
  }
</script>

<form class="cmd" onsubmit={submit}>
  <label class="sr-only" for="cmdline">Move command. Type a board letter and a move, for example: a e4</label>
  <input
    id="cmdline"
    bind:this={input}
    bind:value
    onkeydown={onKey}
    disabled={!enabled}
    type="text"
    autocomplete="off"
    spellcheck="false"
    placeholder="a e4 · b N@f3 · a O-O"
    aria-describedby="cmdhint"
  />
  <button type="submit" disabled={!enabled || !value.trim()}>Play</button>
</form>
<p id="cmdhint" class="small muted hint">
  {#if msg}<span class="err">{msg}</span>
  {:else if suggestions.length}
    {#each suggestions as s, i (s.board + s.san)}<span class="sug">{s.board.toLowerCase()} {s.san}</span>{#if i < suggestions.length - 1}<span aria-hidden="true"> · </span>{/if}{/each}
  {:else}
    Press <kbd>/</kbd> to type a move. Tab completes.
  {/if}
</p>

<style>
  .cmd { display: flex; gap: var(--s-2); margin-top: var(--s-3); }
  .cmd input { flex: 1; min-width: 0; font-variant-numeric: tabular-nums; }
  .hint { margin: var(--s-1) 0 0; min-height: 1.4em; }
  .err { color: var(--alert); font-weight: 800; }
  .sug { font-variant-numeric: tabular-nums; }
  kbd {
    font: inherit; border: 1px solid var(--rule); border-radius: var(--radius);
    padding: 0 4px; background: var(--panel);
  }
</style>
