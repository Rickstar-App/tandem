<script lang="ts">
  import { type Action, type Board, type Color, type DropType, type Game, type Sq, findKing } from '@tandem/engine';
  import type { BoardStatus } from '@tandem/engine';
  import type { RoomSnapshot, SeatId, Team } from '@tandem/server';
  import { colorOn, flippedFor, other, seatId } from '../lib/view.ts';
  import type { ClockView } from '../lib/clock.ts';
  import BoardView from './Board.svelte';
  import Strip from './Strip.svelte';
  import Spine from './Spine.svelte';

  let {
    game, room, viewTeam, myTeam = null, clocks, interactive = false,
    lastMove = { A: null, B: null }, premove = { A: null, B: null },
    selectedSq = $bindable({ A: null, B: null }),
    reserveSel = $bindable({ A: null, B: null }),
    transfer = null, justGained = null, onAct,
  }: {
    game: Game;
    room: RoomSnapshot;
    /** Whose orientation to draw from: your own team, or White-A for spectators. */
    viewTeam: Team;
    myTeam?: Team | null;
    clocks: Record<SeatId, ClockView>;
    interactive?: boolean;
    lastMove?: Record<Board, { from?: Sq; to: Sq } | null>;
    premove?: Record<Board, { from?: Sq; to: Sq } | null>;
    selectedSq?: Record<Board, Sq | null>;
    reserveSel?: Record<Board, DropType | null>;
    transfer?: { toBoard: Board; color: Color; piece: DropType; key: number } | null;
    justGained?: Record<Board, DropType | null> | null;
    onAct?: (b: Board, a: Action) => void;
  } = $props();

  const BOARDS: Board[] = ['A', 'B'];

  /** Which board is enlarged when the viewport cannot give both 34 px squares (BRIEF §5.3). */
  let focus = $state<Board>('A');
  let wrapEl = $state<HTMLElement | null>(null);
  let wrapW = $state(0);
  /** Vertical space the two boards may share, after the page chrome above and below them. */
  let avail = $state(0);

  $effect(() => {
    const el = wrapEl;
    if (!el) return;
    const measure = () => {
      // Distance from the top of the document, not the viewport: a scrolled page must not
      // resize the boards (a viewport-relative value goes negative once you scroll past them).
      const top = el.getBoundingClientRect().top + window.scrollY;
      // Budget: the viewport below the header, less the status line, which must stay visible
      // while playing. The controls below it may sit under the fold on a short screen.
      const status = el.parentElement?.querySelector('.status') as HTMLElement | null;
      const reserved = (status ? status.getBoundingClientRect().height + 16 : 48) + 8;
      avail = Math.max(0, window.innerHeight - top - reserved);
      wrapW = el.clientWidth;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  });

  // Mirrors the dimension tokens in app.css; the layout maths needs them as numbers.
  const STRIP = 44, MINI_STRIP = 34, SPINE = 44, STACKED_SPINE = 24, MIN_SQUARE = 34;
  const MINI_MIN = 72, MINI_MAX = 144;   // the glance board may shrink, but never vanish
  const stacked = $derived(wrapW > 0 && wrapW < 600);
  /** Stacked: both boards must fit the viewport, so the size comes from the height available. */
  const stackedSize = $derived.by(() => {
    if (!stacked || avail <= 0) return null;
    const perBoard = (avail - 4 * STRIP - STACKED_SPINE) / 2;
    return Math.max(0, Math.min(wrapW - 16, perBoard));
  });
  // Hysteresis so a few pixels either way cannot flip the whole layout back and forth.
  let focusMode = $state(false);
  const needsFocus = $derived.by(() => {
    if (!stacked || stackedSize === null) return false;
    const sq = stackedSize / 8;
    if (focusMode) return sq < MIN_SQUARE + 2;
    return sq < MIN_SQUARE;
  });
  $effect(() => { focusMode = needsFocus; });
  /**
   * In focus mode the board you are playing is sized first, to the 34 px floor where the
   * viewport allows it, and the glance board takes what is left. A fixed mini board starved
   * the played board on a short screen: at 360 x 640 it fell to 20 px squares.
   */
  const forBoards = $derived(avail - 2 * STRIP - 2 * MINI_STRIP - STACKED_SPINE - 28);
  const bigSize = $derived(!stacked ? null
    : needsFocus
      ? Math.min(wrapW - 16, Math.max(MIN_SQUARE * 8, forBoards - MINI_MAX))
      : stackedSize);
  const miniSize = $derived(
    Math.max(MINI_MIN, Math.min(MINI_MAX, forBoards - (bigSize ?? 0))));

  function colorFor(b: Board, bottom: boolean): Color {
    const mine = colorOn(viewTeam, b);
    return bottom ? mine : (mine === 'w' ? 'b' : 'w');
  }
  const nameFor = (b: Board, bottom: boolean): string => {
    const team = bottom ? viewTeam : other(viewTeam);
    return room.players[team]?.name ?? (team === 'WA' ? 'White-A' : 'Black-A');
  };
  const connectedFor = (bottom: boolean): boolean => {
    const team = bottom ? viewTeam : other(viewTeam);
    return room.players[team]?.connected ?? true;
  };

  /** Ring the king only when that board's side to move is actually in trouble. */
  function checkSq(b: Board): Sq {
    const st: BoardStatus = room.status[b];
    if (st !== 'check' && st !== 'pending' && st !== 'mate') return -1;
    return findKing(game.pos[b], game.pos[b].turn);
  }

  const canPlay = (b: Board): boolean =>
    interactive && myTeam !== null && room.phase === 'playing';
</script>

<div
  class="wrap"
  class:stacked
  class:focus-mode={needsFocus}
  bind:this={wrapEl}
  data-focus={needsFocus}
>
  {#each BOARDS as b, i (b)}
    {@const big = !needsFocus || focus === b}
    {@const topColor = colorFor(b, false)}
    {@const botColor = colorFor(b, true)}
    {@const topSeat = seatId(b, topColor)}
    {@const botSeat = seatId(b, botColor)}
    <section class="col" class:mini={needsFocus && !big} class:centred={stacked} aria-label={`Board ${b}`}>
      {#if needsFocus && !big}
        <button class="swap" onclick={() => (focus = b)} aria-label={`Play board ${b} at full size`}>
          <span class="badge-sm" class:b={b === 'B'}>{b}</span>
          <span>Tap to play this board</span>
        </button>
      {/if}
      <Strip
        board={b} color={topColor} name={nameFor(b, false)} connected={connectedFor(false)}
        pocket={game.reserve[b][topColor]}
        ms={clocks[topSeat].ms} running={clocks[topSeat].running} low={clocks[topSeat].low}
        compact={needsFocus && !big}
      />
      <BoardView
        board={b}
        {game}
        flipped={flippedFor(viewTeam, b)}
        interactive={canPlay(b) && big}
        myColor={myTeam ? colorOn(myTeam, b) : null}
        lastMove={lastMove[b]}
        premove={premove[b]}
        bind:selected={selectedSq[b]}
        pendingDrop={reserveSel[b]}
        checkSq={checkSq(b)}
        compact={needsFocus && !big}
        size={stacked ? (big && bigSize ? `${Math.round(bigSize)}px` : `${Math.round(miniSize)}px`) : null}
        onAct={(a) => onAct?.(b, a)}
        onCancel={() => { selectedSq[b] = null; reserveSel[b] = null; }}
      />
      <Strip
        board={b} color={botColor} name={nameFor(b, true)} connected={connectedFor(true)}
        pocket={game.reserve[b][botColor]}
        ms={clocks[botSeat].ms} running={clocks[botSeat].running} low={clocks[botSeat].low}
        mine={myTeam !== null}
        interactive={canPlay(b) && big}
        bind:selected={reserveSel[b]}
        justGained={justGained?.[b] ?? null}
        compact={needsFocus && !big}
      />
    </section>
    {#if i === 0}
      <Spine {transfer} horizontal={stacked} compact={stacked} />
    {/if}
  {/each}
</div>

<style>
  .wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--spine-w) minmax(0, 1fr);
    align-items: start;
    container-type: inline-size;
  }
  .stacked { grid-template-columns: minmax(0, 1fr); }
  .col { min-width: 0; }
  /* Stacked boards are sized to the viewport, so centre them in the column. */
  .centred :global(.grid) { margin-inline: auto; }
  .centred { display: grid; }
  /* Focus mode: one board playable at full width, the other kept visible and tappable. */
  .focus-mode .mini { max-width: 240px; margin-inline: auto; }
  .focus-mode .mini :global(.grid) { border-width: 1px; }
  .swap {
    display: flex; align-items: center; justify-content: center; gap: var(--s-2);
    width: 100%; min-height: 32px; padding: var(--s-1) var(--s-2); margin-bottom: var(--s-1);
    background: transparent; color: var(--ink); border-color: var(--rule);
    font-size: var(--fs-small);
  }
  .badge-sm {
    width: calc(var(--badge) * 0.75); height: calc(var(--badge) * 0.75); display: grid; place-items: center;
    background: var(--a-accent); color: var(--on-accent); border-radius: var(--radius); font-weight: 800;
  }
  .badge-sm.b { background: var(--b-accent); }
</style>
