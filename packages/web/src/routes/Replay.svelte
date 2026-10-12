<script lang="ts">
  import { type Board, type Sq, gameFrom, newGame, parseFen } from '@tandem/engine';
  import { tableName } from '@tandem/server';
  import type { GameRecord, SeatId } from '@tandem/server';
  import { interpolate } from '../lib/clock.ts';
  import TopBar from '../components/TopBar.svelte';
  import BoardPair from '../components/BoardPair.svelte';
  import MoveList from '../components/MoveList.svelte';
  import StatusLine from '../components/StatusLine.svelte';

  let { id }: { id: string } = $props();

  let rec = $state<GameRecord | null>(null);
  let error = $state('');
  let i = $state(-1); // -1 is the starting position
  let movesOpen = $state(true);

  /**
   * The server writes a finished game to storage as the game ends, so arriving here straight from
   * the result screen can read a 404 for a game that does exist. Measured at 53-512ms against
   * Cloudflare. So a 404 is retried briefly before it is believed; the player sees "Loading the
   * game…" meanwhile. Any other status fails at once, and the budget is small enough that a
   * genuinely unknown or expired link still reports itself promptly.
   */
  const RETRY_404_MS = [120, 240, 480, 800, 900];

  $effect(() => {
    let live = true;
    void (async () => {
      for (let attempt = 0; live; attempt++) {
        try {
          const r = await fetch(`/api/game/${id}`);
          if (!live) return;
          if (r.status === 404 && attempt < RETRY_404_MS.length) {
            await new Promise(res => setTimeout(res, RETRY_404_MS[attempt]));
            continue;
          }
          if (r.status === 404) throw new Error('That game is not finished, or is older than 90 days.');
          if (!r.ok) throw new Error('Could not load that game.');
          const d = await r.json() as GameRecord;
          if (!live) return;
          rec = d;
          i = d.ply.length - 1;
          return;
        } catch (e) {
          if (live) error = e instanceof Error ? e.message : String(e);
          return;
        }
      }
    })();
    return () => { live = false; };
  });

  const at = $derived(rec && i >= 0 ? rec.ply[i]! : null);
  const game = $derived.by(() => {
    if (!rec) return newGame();
    if (!at) return newGame();
    const a = parseFen(at.fen.A), b = parseFen(at.fen.B);
    return gameFrom(a.pos, b.pos, { A: a.pockets, B: b.pockets });
  });

  /** Replays show the clocks as they stood, so nothing is interpolated here. */
  const clocks = $derived.by(() => {
    const base = at?.clocks ?? ({ 'A-w': rec ? rec.tc.baseMin * 60000 : 0, 'A-b': rec ? rec.tc.baseMin * 60000 : 0, 'B-w': rec ? rec.tc.baseMin * 60000 : 0, 'B-b': rec ? rec.tc.baseMin * 60000 : 0 } as Record<SeatId, number>);
    return interpolate(base, 0, [], 0, rec ? Math.min(20000, rec.tc.baseMin * 6000) : 20000);
  });

  const room = $derived(rec ? {
    id, phase: 'over' as const, tc: rec.tc, startAt: null,
    players: { WA: { name: rec.players.WA, connected: true }, BA: { name: rec.players.BA, connected: true } },
    ready: { WA: false, BA: false }, spectators: 0,
    fen: at ? at.fen : { A: newFen(), B: newFen() },
    status: { A: 'ok' as const, B: 'ok' as const },
    turn: { A: turnOf('A'), B: turnOf('B') },
    clocks: at?.clocks ?? ({} as Record<SeatId, number>), clocksAt: 0, running: [],
    lowTimeMs: 20000, ply: rec.ply, result: rec.result, drawOffer: null, rematch: null,
    claimable: { WA: false, BA: false }, hostTeam: 'WA' as const, host: null,
  } : null);

  function newFen() { return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1'; }
  function turnOf(b: Board): 'w' | 'b' {
    const f = at ? at.fen[b] : newFen();
    return (f.split(' ')[1] as 'w' | 'b') ?? 'w';
  }

  const lastMove = $derived<Record<Board, { from?: Sq; to: Sq } | null>>(
    at ? { A: null, B: null, [at.board]: at.action.kind === 'move' ? { from: at.action.from, to: at.action.to } : { to: at.action.to } } as Record<Board, { from?: Sq; to: Sq } | null>
       : { A: null, B: null });

  const total = $derived(rec?.ply.length ?? 0);
  const go = (n: number) => { i = Math.max(-1, Math.min(total - 1, n)); };

  function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT') return;
    if (e.key === 'ArrowLeft') { go(i - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { go(i + 1); e.preventDefault(); }
    if (e.key === 'Home') { go(-1); e.preventDefault(); }
    if (e.key === 'End') { go(total - 1); e.preventDefault(); }
  }
</script>

<svelte:window onkeydown={onKey} />
<TopBar subtitle={`Replay · ${tableName(id)}`} />

<main class="page">
  {#if error}
    <h1>Replay</h1>
    <p role="alert">{error}</p>
    <p><a href="/">Set up a new table</a></p>
  {:else if !rec || !room}
    <p class="muted">Loading the game…</p>
  {:else}
    <p class="headline"><b>{rec.result.text}</b></p>

    <BoardPair {game} room={room} viewTeam="WA" myTeam={null} {clocks} {lastMove} />
    <StatusLine room={room} />

    <div class="transport" role="group" aria-label="Replay controls">
      <button class="quiet" onclick={() => go(-1)} disabled={i < 0} aria-label="Start">⏮</button>
      <button class="quiet" onclick={() => go(i - 1)} disabled={i < 0} aria-label="Previous move">◀</button>
      <input
        type="range" min="-1" max={total - 1} value={i}
        oninput={(e) => go(Number((e.target as HTMLInputElement).value))}
        aria-label="Move number"
      />
      <button class="quiet" onclick={() => go(i + 1)} disabled={i >= total - 1} aria-label="Next move">▶</button>
      <button class="quiet" onclick={() => go(total - 1)} disabled={i >= total - 1} aria-label="End">⏭</button>
      <span class="small muted count">{i + 1} / {total}</span>
    </div>

    <p class="small muted">
      Arrow keys step through the game.
      <a href={`/api/game/${id}.txt`} download>Download text</a> ·
      <a href={`/api/game/${id}.json`} download>Download JSON</a>
    </p>

    <MoveList ply={rec.ply} bind:open={movesOpen} current={i} onSeek={go} />
  {/if}
</main>

<style>
  .headline { font-size: 1.0625rem; }
  .transport { display: flex; align-items: center; gap: var(--s-2); margin-top: var(--s-3); }
  .transport input[type="range"] { flex: 1; min-width: 0; accent-color: var(--ink); }
  .count { font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
