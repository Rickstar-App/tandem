<script lang="ts">
  import { untrack } from 'svelte';
  import { type Action, type Board, type DropType, type Game, type Sq, legal, newGame, sameAction } from '@tandem/engine';
  import { tableName } from '@tandem/server';
  import type { ClientMsg, RoomSnapshot, SeatId, ServerMsg, Team, TimeControl } from '@tandem/server';
  import { Net, type Status } from '../lib/net.ts';
  import { getName, getSeatToken, setName, setSeatToken } from '../lib/storage.ts';
  import { interpolate, speakClock } from '../lib/clock.ts';
  import { play as playSound, wake as wakeAudio } from '../lib/sound.ts';
  import { colorOn, gameFromSnapshot, other, statusWords } from '../lib/view.ts';
  import { navigate } from '../lib/router.ts';
  import BoardPair from '../components/BoardPair.svelte';
  import StatusLine from '../components/StatusLine.svelte';
  import MoveList from '../components/MoveList.svelte';
  import CommandLine from '../components/CommandLine.svelte';
  import Controls from '../components/Controls.svelte';
  import Live from '../components/Live.svelte';
  import TopBar from '../components/TopBar.svelte';
  import Lobby from './Lobby.svelte';
  import Result from './Result.svelte';

  let { id, spectate = false }: { id: string; spectate?: boolean } = $props();

  let net = $state<Net | null>(null);
  let status = $state<Status>('connecting');
  let room = $state<RoomSnapshot | null>(null);
  let myTeam = $state<Team | null>(null);
  let myName = $state(getName());
  let rejected = $state('');
  let announce = $state('');
  let nowMs = $state(Date.now());

  // Per-board interaction state.
  let selectedSq = $state<Record<Board, Sq | null>>({ A: null, B: null });
  let reserveSel = $state<Record<Board, DropType | null>>({ A: null, B: null });
  let premove = $state<Record<Board, Action | null>>({ A: null, B: null });
  let lastMove = $state<Record<Board, { from?: Sq; to: Sq } | null>>({ A: null, B: null });
  let justGained = $state<Record<Board, DropType | null>>({ A: null, B: null });
  let transfer = $state<{ toBoard: Board; color: 'w' | 'b'; piece: DropType; key: number } | null>(null);
  let movesOpen = $state(false);
  /** The typed move line is the fast path with a keyboard; on a phone it would only cost board height. */
  let narrow = $state(false);
  let cmdOpen = $state(true);
  $effect(() => {
    const m = window.matchMedia('(max-width: 599px)');
    const apply = () => { narrow = m.matches; cmdOpen = !m.matches; };
    apply();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  });
  let cmd = $state<ReturnType<typeof CommandLine> | null>(null);

  const game = $derived<Game>(room ? gameFromSnapshot(room) : newGame());
  let watchFlipped = $state(false);
  const viewTeam = $derived<Team>(myTeam ?? (watchFlipped ? 'BA' : 'WA'));
  const clocks = $derived(room
    ? interpolate(room.clocks, room.clocksAt, room.running, nowMs + (net?.offset ?? 0), room.lowTimeMs)
    : ({} as ReturnType<typeof interpolate>));

  const yourTurn = $derived<Record<Board, boolean>>({
    A: !!myTeam && room?.phase === 'playing' && game.pos.A.turn === colorOn(myTeam, 'A'),
    B: !!myTeam && room?.phase === 'playing' && game.pos.B.turn === colorOn(myTeam, 'B'),
  });

  // ---- connection ---------------------------------------------------------

  $effect(() => {
    // Depend on the table alone. Reading myName here would reopen the socket every time the
    // player edits their name, and any snapshot sent during that gap would be lost.
    const table = id;
    const asWatcher = spectate;
    const n = untrack(() => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${table}`;
      const made = new Net(url, { onMessage: handle, onStatus: (s) => (status = s) });
      made.setJoin(asWatcher
        ? { type: 'join', name: myName || undefined, spectate: true }
        : { type: 'join', name: myName || undefined, seatToken: getSeatToken(table) });
      made.connect();
      return made;
    });
    net = n;
    return () => n.close();
  });

  // Clocks tick locally between server messages; the server stays the authority.
  $effect(() => {
    const t = setInterval(() => (nowMs = Date.now()), 100);
    return () => clearInterval(t);
  });

  let lastAnnounceAt: Record<Board, number> = { A: 0, B: 0 };
  let lowAnnounced = new Set<SeatId>();

  function handle(m: ServerMsg) {
    if (m.type === 'joined') {
      myTeam = m.team;
      if (m.seatToken) setSeatToken(id, m.seatToken);
      // We connect as soon as the page loads, so the reply can arrive after the player has
      // already typed a name. Never overwrite what they typed; tell the server instead.
      if (!myName) myName = m.name;
      else if (myName !== m.name) net?.send({ type: 'rename', name: myName });
      applyPendingSetup();
      return;
    }
    if (m.type === 'reject') {
      rejected = m.reason;
      setTimeout(() => (rejected = ''), 4000);
      return;
    }
    if (m.type === 'snapshot') { room = m.room; return; }
    if (m.type === 'ended') {
      room = m.room;
      playSound('end');
      announce = m.result.text;
      return;
    }
    if (m.type === 'presence') return; // the snapshot that follows carries the detail
    if (m.type === 'action') {
      const p = m.ply;
      // Apply the delta the server sent; both FENs are included so we can never drift.
      if (room) {
        room = {
          ...room,
          fen: p.fen,
          ply: [...room.ply, p],
          clocks: p.clocks,
          clocksAt: m.clocksAt,
          running: m.running,
          status: m.status,
          turn: {
            A: p.fen.A.split(' ')[1] as 'w' | 'b',
            B: p.fen.B.split(' ')[1] as 'w' | 'b',
          },
        };
      }
      lastMove = {
        ...lastMove,
        [p.board]: p.action.kind === 'move'
          ? { from: p.action.from, to: p.action.to }
          : { to: p.action.to },
      };
      if (p.transfer) {
        const t = p.transfer;
        transfer = { ...t, piece: t.piece as DropType, key: p.n };
        justGained = { ...justGained, [t.toBoard]: t.piece as DropType };
        // Clear both once the crossing has played, so nothing lingers in the spine.
        setTimeout(() => {
          justGained = { ...justGained, [t.toBoard]: null };
          transfer = null;
        }, 500);
      }
      const cue = p.san.includes('#') || p.san.includes('+') ? 'check'
        : p.action.kind === 'drop' ? 'drop'
        : p.san.includes('x') ? 'capture' : 'move';
      playSound(cue);
      // One announcement per board per second keeps a screen reader usable with two boards.
      const t = Date.now();
      if (t - lastAnnounceAt[p.board] > 1000) {
        lastAnnounceAt[p.board] = t;
        announce = `Board ${p.board}, ${p.color === 'w' ? 'White' : 'Black'} ${p.san}`;
      }
      queueMicrotask(tryPremove);
      return;
    }
  }

  // Low-time warning, once per seat as it crosses the threshold (BRIEF §5.5).
  $effect(() => {
    if (!room || !myTeam) return;
    for (const seat of Object.keys(clocks) as SeatId[]) {
      const c = clocks[seat];
      const mine = (seat[0] === 'A' ? colorOn(myTeam, 'A') : colorOn(myTeam, 'B')) === seat[2];
      if (!mine) continue;
      if (c.low && !lowAnnounced.has(seat)) {
        lowAnnounced.add(seat);
        playSound('low');
        announce = `Board ${seat[0]}, ${speakClock(c.ms)} left`;
      } else if (!c.low && lowAnnounced.has(seat)) lowAnnounced.delete(seat);
    }
  });

  // ---- acting -------------------------------------------------------------

  /** Carry the choices made on the home page into the table the host just created. */
  function applyPendingSetup() {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem('tandem.pending'); } catch { return; }
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as { id: string; tc: TimeControl; team: 'WA' | 'BA' | 'random' };
      if (p.id !== id) return;
      net?.send({ type: 'setup', tc: p.tc, team: p.team });
      if (myName) net?.send({ type: 'rename', name: myName });
    } catch { /* malformed; nothing to apply */ }
    try { sessionStorage.removeItem('tandem.pending'); } catch { /* ignore */ }
  }

  function send(m: ClientMsg | { type: string; [k: string]: unknown }) {
    wakeAudio();
    net?.send(m as ClientMsg);
  }

  function act(board: Board, a: Action) {
    if (!myTeam || !room) return;
    selectedSq = { ...selectedSq, [board]: null };
    reserveSel = { ...reserveSel, [board]: null };
    if (yourTurn[board]) {
      send({ type: 'action', board, action: a });
      return;
    }
    // Not your turn yet: queue it as the one premove allowed on this board.
    premove = { ...premove, [board]: a };
  }

  function tryPremove() {
    if (!room || !myTeam) return;
    for (const b of ['A', 'B'] as Board[]) {
      const p = premove[b];
      if (!p) continue;
      if (game.pos[b].turn !== colorOn(myTeam, b)) continue;
      premove = { ...premove, [b]: null };
      // Validate locally first so an impossible premove is dropped quietly, not bounced by the server.
      if (legal(game, b).some(l => sameAction(l, p))) send({ type: 'action', board: b, action: p });
    }
  }
  $effect(() => { if (yourTurn.A || yourTurn.B) tryPremove(); });

  const premoveMarks = $derived<Record<Board, { from?: Sq; to: Sq } | null>>({
    A: premove.A ? (premove.A.kind === 'move' ? { from: premove.A.from, to: premove.A.to } : { to: premove.A.to }) : null,
    B: premove.B ? (premove.B.kind === 'move' ? { from: premove.B.from, to: premove.B.to } : { to: premove.B.to }) : null,
  });

  /**
   * Clicking away abandons a held piece, the way putting it down on a real table would.
   * A click inside one board is that board's own to interpret (it may be a legal square),
   * but it still cancels anything being held on the other board.
   */
  function onDocClick(e: MouseEvent) {
    const el = e.target as HTMLElement | null;
    const section = el?.closest?.('section[aria-label^="Board "]') as HTMLElement | null;
    const label = section?.getAttribute('aria-label') ?? '';
    const clicked: Board | null = label.endsWith('A') ? 'A' : label.endsWith('B') ? 'B' : null;

    if (clicked === null) {
      if (selectedSq.A || selectedSq.B || reserveSel.A || reserveSel.B) {
        selectedSq = { A: null, B: null };
        reserveSel = { A: null, B: null };
      }
      return;
    }
    const other: Board = clicked === 'A' ? 'B' : 'A';
    if (selectedSq[other] !== null || reserveSel[other] !== null) {
      selectedSq = { ...selectedSq, [other]: null };
      reserveSel = { ...reserveSel, [other]: null };
    }
  }

  function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === '/') {
      e.preventDefault();
      cmdOpen = true;
      // Wait for the field to exist before focusing it on narrow screens.
      queueMicrotask(() => cmd?.focus());
    }
    if (e.key === '1' || e.key === '2') {
      const b = e.key === '1' ? 'A' : 'B';
      const grid = document.querySelector<HTMLElement>(`section[aria-label="Board ${b}"] .grid`);
      if (grid) { grid.focus(); e.preventDefault(); }
    }
    if (e.key === 'Escape') {
      premove = { A: null, B: null };
      selectedSq = { A: null, B: null };
      reserveSel = { A: null, B: null };
    }
  }

  const tcText = (tc: TimeControl) => `${tc.baseMin}+${tc.incSec}`;
</script>

<svelte:window onkeydown={onKey} onclick={onDocClick} />

<TopBar subtitle={room ? `${tableName(id)} · ${tcText(room.tc)}${myTeam ? ` · you are ${myTeam === 'WA' ? 'White-A' : 'Black-A'}` : ' · watching'}` : tableName(id)} />

<main class="page">
  {#if status !== 'open'}
    <p class="banner" role="status">
      {status === 'connecting' ? 'Connecting…' : 'Connection lost. Trying again — your seat is held.'}
    </p>
  {/if}
  {#if rejected}
    <p class="banner err" role="alert">{rejected}</p>
  {/if}

  {#if !room}
    <p class="muted">Loading the table…</p>
  {:else if room.phase === 'setup' || room.phase === 'countdown'}
    <Lobby {room} {myTeam} {id} {send} bind:myName />
  {:else}
    {#if room.result}
      <Result {room} {myTeam} {send} {id} />
    {/if}

    <BoardPair
      {game} {room} {viewTeam} {myTeam} {clocks}
      interactive={!!myTeam && !room.result}
      lastMove={lastMove}
      premove={premoveMarks}
      bind:selectedSq
      bind:reserveSel
      {transfer}
      {justGained}
      onAct={act}
    />

    <StatusLine {room} {yourTurn} />

    {#if myTeam && !room.result}
      {#if cmdOpen}
        <CommandLine bind:this={cmd} {game} {myTeam} onAct={act} enabled={room.phase === 'playing'} />
      {:else}
        <button class="quiet typemove" onclick={() => { cmdOpen = true; queueMicrotask(() => cmd?.focus()); }}>
          Type a move
        </button>
      {/if}
      <Controls {room} {myTeam} {send} />
    {/if}

    {#if !myTeam}
      <div class="watchbar">
        <button class="quiet" onclick={() => (watchFlipped = !watchFlipped)}>
          Flip to {watchFlipped ? 'White-A' : 'Black-A'}'s view
        </button>
        <span class="small muted">Watching {room.players[viewTeam]?.name ?? ''}'s side</span>
      </div>
    {/if}
    {#if room.spectators > 0}
      <p class="small muted watchers">{room.spectators} watching</p>
    {/if}

    <MoveList ply={room.ply} bind:open={movesOpen} />
  {/if}
</main>

<Live text={announce} />

<style>
  .banner {
    border: 1px solid var(--rule); border-left: 3px solid var(--ink);
    padding: var(--s-2) var(--s-3); margin: 0 0 var(--s-3);
  }
  .banner.err { border-left-color: var(--alert); color: var(--alert); font-weight: 800; }
  .watchers { margin-top: var(--s-3); }
  .typemove { margin-top: var(--s-2); min-height: 36px; font-size: var(--fs-small); }
  .watchbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-top: var(--s-3); }
</style>
