<script lang="ts">
  import { type Action, type Board, apply, legal, newGame, parseSan } from '@tandem/engine';
  import type { TimeControl } from '@tandem/server';
  import { navigate } from '../lib/router.ts';
  import { getName, setName } from '../lib/storage.ts';
  import TopBar from '../components/TopBar.svelte';
  import BoardView from '../components/Board.svelte';
  import Spine from '../components/Spine.svelte';

  const PRESETS: TimeControl[] = [
    { baseMin: 1, incSec: 0 }, { baseMin: 2, incSec: 0 }, { baseMin: 3, incSec: 0 },
    { baseMin: 5, incSec: 0 }, { baseMin: 10, incSec: 0 }, { baseMin: 3, incSec: 2 },
  ];
  let tc = $state<TimeControl>({ baseMin: 5, incSec: 0 });
  let team = $state<'WA' | 'BA' | 'random'>('WA');
  let name = $state(getName());
  let busy = $state(false);
  let error = $state('');

  async function createTable() {
    busy = true; error = '';
    try {
      setName(name);
      const res = await fetch('/api/table', { method: 'POST' });
      if (!res.ok) throw new Error('could not create a table');
      const { id } = await res.json() as { id: string };
      sessionStorage.setItem('tandem.pending', JSON.stringify({ id, tc, team }));
      navigate(`/t/${id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'could not create a table';
      busy = false;
    }
  }

  // A short scripted sequence showing the one thing that makes this game itself:
  // a capture on one board becoming a drop on the other.
  const SCRIPT: [Board, string][] = [
    ['A', 'e4'], ['B', 'd4'], ['A', 'd5'], ['B', 'Nf6'], ['A', 'exd5'], ['B', 'c4'],
    ['B', 'P@e4'], ['A', 'Qxd5'], ['B', 'd5'], ['A', 'Nc3'],
  ];
  let demo = $state(newGame());
  let demoLast = $state<Record<Board, { from?: number; to: number } | null>>({ A: null, B: null });
  let demoTransfer = $state<{ toBoard: Board; color: 'w' | 'b'; piece: 'p'; key: number } | null>(null);
  let step = 0;

  $effect(() => {
    const tick = () => {
      if (step >= SCRIPT.length) { demo = newGame(); demoLast = { A: null, B: null }; step = 0; return; }
      const [b, text] = SCRIPT[step]!;
      const a = parseSan(demo, b, text);
      if (!a) { step = SCRIPT.length; return; }
      const r = apply(demo, b, a);
      demo = r.game;
      demoLast = { ...demoLast, [b]: a.kind === 'move' ? { from: a.from, to: a.to } : { to: a.to } };
      if (r.transfer) demoTransfer = { toBoard: r.transfer.toBoard, color: r.transfer.color, piece: 'p', key: step };
      step++;
    };
    const first = setTimeout(tick, 250);
    const id = setInterval(tick, 1100);
    return () => { clearTimeout(first); clearInterval(id); };
  });
</script>

<TopBar />

<main class="page home">
  <div class="intro">
    <h1>Bughouse where you play both boards</h1>
    <p>
      Two players, two boards. You play White on Board A and Black on Board B; your opponent plays
      the other side of each. Every piece you capture on one board lands in your own reserve on the
      other, to drop on an empty square. Each board has its own clock, so you cannot leave one alone.
    </p>
    <p class="small muted">
      <a href="/rules">Full rules</a> — including why a check you could block is not checkmate.
    </p>
  </div>

  <form class="setup" onsubmit={(e) => { e.preventDefault(); createTable(); }}>
    <h2>Set a table</h2>

    <div class="field">
      <label for="who">Your name</label>
      <input id="who" type="text" maxlength="20" bind:value={name} placeholder="Guest" autocomplete="nickname" />
    </div>

    <fieldset>
      <legend>Time control</legend>
      <div class="chips">
        {#each PRESETS as p (`${p.baseMin}+${p.incSec}`)}
          <button
            type="button" class="quiet chip"
            class:on={tc.baseMin === p.baseMin && tc.incSec === p.incSec}
            aria-pressed={tc.baseMin === p.baseMin && tc.incSec === p.incSec}
            onclick={() => (tc = p)}
          >{p.baseMin}+{p.incSec}</button>
        {/each}
      </div>
      <div class="row">
        <label for="base" class="small">Custom</label>
        <input id="base" type="number" min="1" max="30" bind:value={tc.baseMin} aria-label="Minutes per seat" />
        <span aria-hidden="true">+</span>
        <input id="inc" type="number" min="0" max="10" bind:value={tc.incSec} aria-label="Increment in seconds" />
      </div>
      <p class="small muted">Minutes for each of your two clocks, plus any increment.</p>
    </fieldset>

    <fieldset>
      <legend>Your team</legend>
      <div class="chips">
        {#each [['WA', 'White-A'], ['BA', 'Black-A'], ['random', 'Random']] as const as [v, l]}
          <button
            type="button" class="quiet chip" class:on={team === v}
            aria-pressed={team === v} onclick={() => (team = v)}
          >{l}</button>
        {/each}
      </div>
      <p class="small muted">
        {team === 'WA' ? 'White on Board A, Black on Board B.'
          : team === 'BA' ? 'Black on Board A, White on Board B.'
          : 'Decided when the game starts.'}
      </p>
    </fieldset>

    <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create table'}</button>
    {#if error}<p class="err small" role="alert">{error}</p>{/if}
    <p class="small muted">You get a link to send to one other person.</p>
  </form>

  <div class="demo" aria-hidden="true">
    <div class="pair">
      <BoardView board="A" game={demo} lastMove={demoLast.A} compact />
      <Spine transfer={demoTransfer} />
      <BoardView board="B" game={demo} flipped lastMove={demoLast.B} compact />
    </div>
    <p class="small muted caption">A capture on one board becomes a drop on the other.</p>
  </div>
</main>

<style>
  .home {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
    gap: var(--s-7) var(--s-6);
    align-items: start;
  }
  .intro { grid-column: 1; max-width: 62ch; }
  .intro h1 { font-size: 2rem; }
  .setup { grid-column: 2; grid-row: 1 / span 2; border-left: 1px solid var(--rule); padding-left: var(--s-5); }
  .demo { grid-column: 1; }
  .pair { display: grid; grid-template-columns: minmax(0, 1fr) var(--spine-w) minmax(0, 1fr); align-items: center; max-width: 560px; }
  .caption { margin-top: var(--s-2); }
  .field { display: grid; gap: var(--s-1); margin-bottom: var(--s-4); }
  label { font-size: var(--fs-small); color: var(--ink-2); }
  fieldset { border: 0; border-top: 1px solid var(--rule); padding: var(--s-3) 0 0; margin: 0 0 var(--s-4); }
  legend { font-size: var(--fs-small); color: var(--ink-2); padding: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: var(--s-1); margin-bottom: var(--s-2); }
  .chip { min-height: 36px; padding: var(--s-1) var(--s-3); font-variant-numeric: tabular-nums; }
  .chip.on { background: var(--ink); color: var(--page); border-color: var(--ink); }
  .row { display: flex; align-items: center; gap: var(--s-2); }
  .row input[type="number"] { width: 5rem; }
  .err { color: var(--alert); font-weight: 800; }
  @media (max-width: 900px) {
    .home { grid-template-columns: minmax(0, 1fr); }
    .intro, .setup, .demo { grid-column: 1; }
    .setup { grid-row: auto; border-left: 0; padding-left: 0; border-top: 1px solid var(--rule); padding-top: var(--s-4); }
  }
</style>
