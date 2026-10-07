<script lang="ts">
  import { type Action, type Board, type Color, type Game, type Sq, file, rank, sqName, sqOf } from '@tandem/engine';
  import { actionsAsIfMyTurn } from '../lib/view.ts';
  import Piece from './Piece.svelte';

  let {
    board, game, flipped = false, interactive = false, myColor = null,
    lastMove = null, premove = null, selected = $bindable(null), pendingDrop = null,
    onAct, size = null, compact = false, checkSq = -1,
  }: {
    board: Board;
    game: Game;
    flipped?: boolean;
    interactive?: boolean;
    myColor?: Color | null;
    lastMove?: { from?: Sq; to: Sq } | null;
    premove?: { from?: Sq; to: Sq } | null;
    selected?: Sq | null;
    /** A reserve piece picked up, awaiting a target square. */
    pendingDrop?: string | null;
    onAct?: (a: Action) => void;
    size?: string | null;
    compact?: boolean;
    /** Square of a king in check or pending, ringed in the alert colour (BRIEF §5.2). */
    checkSq?: Sq;
  } = $props();

  const accent = $derived(board === 'A' ? 'var(--a-accent)' : 'var(--b-accent)');
  const light = $derived(board === 'A' ? 'var(--a-sq-light)' : 'var(--b-sq-light)');
  const dark = $derived(board === 'A' ? 'var(--a-sq-dark)' : 'var(--b-sq-dark)');

  const pos = $derived(game.pos[board]);
  const myTurn = $derived(interactive && myColor !== null && pos.turn === myColor);
  /** On your turn these are the legal actions; before it, the candidates for one premove. */
  const myLegal = $derived(interactive && myColor !== null ? actionsAsIfMyTurn(game, board, myColor) : []);

  /** Squares in display order: a8..h1 normally, h1..a8 when flipped. */
  const squares = $derived.by(() => {
    const out: Sq[] = [];
    for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) out.push(sqOf(flipped ? 7 - f : f, flipped ? 7 - r : r));
    return out;
  });

  const targets = $derived.by(() => {
    const set = new Set<Sq>();
    if (pendingDrop) {
      for (const a of myLegal) if (a.kind === 'drop' && a.piece === pendingDrop) set.add(a.to);
    } else if (selected !== null) {
      for (const a of myLegal) if (a.kind === 'move' && a.from === selected) set.add(a.to);
    }
    return set;
  });

  function actionsFor(from: Sq, to: Sq): Action[] {
    return myLegal.filter(a => a.kind === 'move' && a.from === from && a.to === to);
  }

  function commit(to: Sq) {
    if (!onAct) return;
    if (pendingDrop) {
      const a = myLegal.find(x => x.kind === 'drop' && x.piece === pendingDrop && x.to === to);
      if (a) onAct(a);
      return;
    }
    if (selected === null) return;
    const cands = actionsFor(selected, to);
    if (!cands.length) return;
    if (cands.length > 1) { promoAt = { from: selected, to }; return; }
    onAct(cands[0]!);
    selected = null;
  }

  let promoAt = $state<{ from: Sq; to: Sq } | null>(null);
  function choosePromo(p: 'q' | 'r' | 'b' | 'n') {
    if (!promoAt || !onAct) return;
    const a = myLegal.find(x => x.kind === 'move' && x.from === promoAt!.from && x.to === promoAt!.to && x.promo === p);
    if (a) onAct(a);
    promoAt = null; selected = null;
  }

  function onSquare(sq: Sq) {
    if (!interactive) return;
    const piece = pos.sq[sq];
    if (pendingDrop) { commit(sq); return; }
    if (selected !== null && targets.has(sq)) { commit(sq); return; }
    if (selected === sq) { selected = null; return; }
    if (piece && myColor && piece.c === myColor) { selected = sq; return; }
    selected = null;
  }

  // Keyboard square cursor (BRIEF §5.4).
  // Centre of the board, so the starting point reads the same from either orientation.
  let cursor = $state<Sq>(sqOf(4, 3));
  function onKey(e: KeyboardEvent) {
    if (!interactive) return;
    const f = file(cursor), r = rank(cursor);
    const step = (df: number, dr: number) => {
      const nf = Math.min(7, Math.max(0, f + (flipped ? -df : df)));
      const nr = Math.min(7, Math.max(0, r + (flipped ? -dr : dr)));
      cursor = sqOf(nf, nr);
      e.preventDefault();
    };
    if (e.key === 'ArrowLeft') step(-1, 0);
    else if (e.key === 'ArrowRight') step(1, 0);
    else if (e.key === 'ArrowUp') step(0, 1);
    else if (e.key === 'ArrowDown') step(0, -1);
    else if (e.key === 'Enter' || e.key === ' ') { onSquare(cursor); e.preventDefault(); }
    else if (e.key === 'Escape') { selected = null; e.preventDefault(); }
  }

  // Drag and drop.
  let focused = $state(false);
  let dragFrom = $state<Sq | null>(null);
  function onDragStart(e: DragEvent, sq: Sq) {
    const piece = pos.sq[sq];
    if (!interactive || !piece || !myColor || piece.c !== myColor) { e.preventDefault(); return; }
    dragFrom = sq; selected = sq;
    e.dataTransfer?.setData('text/plain', sqName(sq));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function onDrop(e: DragEvent, sq: Sq) {
    e.preventDefault();
    const data = e.dataTransfer?.getData('text/plain') ?? '';
    if (data.startsWith('@')) { // a reserve piece
      const piece = data.slice(1);
      const a = myLegal.find(x => x.kind === 'drop' && x.piece === piece && x.to === sq);
      if (a && onAct) onAct(a);
      return;
    }
    if (dragFrom !== null) { selected = dragFrom; commit(sq); dragFrom = null; }
  }
</script>

<!--
  An interactive board is a composite widget with its own arrow-key navigation, which is exactly
  what role="application" describes; a read-only board is a picture of a position.
-->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role, a11y_no_noninteractive_tabindex -->
<div
  class="grid"
  class:compact
  style:--accent={accent} style:--sq-light={light} style:--sq-dark={dark}
  style:width={size ?? '100%'}
  role={interactive ? 'application' : 'img'}
  aria-label={`Board ${board}`}
  tabindex={interactive ? 0 : -1}
  onkeydown={onKey}
  onfocus={() => (focused = true)}
  onblur={() => (focused = false)}
>
  {#each squares as sq (sq)}
    {@const p = pos.sq[sq]}
    {@const isLight = (file(sq) + rank(sq)) % 2 === 1}
    {@const isTarget = targets.has(sq)}
    <div
      class="sq"
      class:light={isLight}
      class:dark={!isLight}
      class:last={lastMove && (lastMove.to === sq || lastMove.from === sq)}
      class:sel={selected === sq}
      class:cursor={interactive && focused && cursor === sq}
      class:check={checkSq === sq}
      class:pre={premove && (premove.to === sq || premove.from === sq)}
      role={interactive ? 'button' : 'presentation'}
      tabindex="-1"
      aria-label={interactive ? `${sqName(sq)}${p ? `, ${p.c === 'w' ? 'white' : 'black'} ${p.t}` : ', empty'}` : undefined}
      onclick={() => onSquare(sq)}
      ondragover={(e) => { if (interactive) e.preventDefault(); }}
      ondrop={(e) => onDrop(e, sq)}
    >
      {#if compact === false}
        {#if file(sq) === (flipped ? 7 : 0)}<span class="coord rank">{rank(sq) + 1}</span>{/if}
        {#if rank(sq) === (flipped ? 7 : 0)}<span class="coord file">{'abcdefgh'[file(sq)]}</span>{/if}
      {/if}
      {#if p}
        <span
          class="pw"
          draggable={interactive && myColor === p.c}
          ondragstart={(e) => onDragStart(e, sq)}
          ondragend={() => { dragFrom = null; }}
          role="presentation"
        >
          <Piece color={p.c} type={p.t} promoted={p.promoted === true} />
        </span>
      {/if}
      {#if isTarget}<span class="dot" class:occupied={!!p}></span>{/if}
    </div>
  {/each}

  {#if promoAt}
    <div class="promo" role="dialog" aria-label="Choose a promotion piece">
      {#each ['q', 'r', 'b', 'n'] as const as p}
        <button class="promo-btn" onclick={() => choosePromo(p)} aria-label={`Promote to ${p}`}>
          <Piece color={myColor ?? 'w'} type={p} />
        </button>
      {/each}
      <button class="promo-cancel quiet" onclick={() => { promoAt = null; }}>Cancel</button>
    </div>
  {/if}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    grid-template-rows: repeat(8, minmax(0, 1fr));
    aspect-ratio: 1;
    border: 1px solid var(--rule);
    position: relative;
    touch-action: manipulation;
  }
  .grid:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .sq { position: relative; display: grid; place-items: center; }
  .light { background: var(--sq-light); }
  .dark { background: var(--sq-dark); }
  .last::after { content: ""; position: absolute; inset: 0; background: var(--last-move); }
  .sel { box-shadow: inset 0 0 0 3px var(--accent); }
  .cursor { box-shadow: inset 0 0 0 2px var(--ink); }
  .check { box-shadow: inset 0 0 0 3px var(--alert); }
  .pre::after { content: ""; position: absolute; inset: 0; border: 2px dashed var(--accent); }
  .pw { position: relative; z-index: 2; width: 92%; height: 92%; display: block; }
  .dot {
    position: absolute; z-index: 1; width: 26%; height: 26%; border-radius: 50%;
    background: color-mix(in srgb, var(--ink) 45%, transparent);
  }
  .dot.occupied {
    width: 92%; height: 92%; border-radius: 0; background: none;
    box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--ink) 45%, transparent);
  }
  .coord { position: absolute; z-index: 3; font-size: clamp(8px, 1.6cqw, 11px); font-weight: 800; pointer-events: none; }
  .rank { top: 2px; left: 3px; }
  .file { bottom: 1px; right: 3px; }
  .light .coord { color: var(--accent); }
  .dark .coord { color: #fff; }
  .promo {
    position: absolute; inset: 0; z-index: 5;
    display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--s-2);
    background: color-mix(in srgb, var(--page) 92%, transparent);
  }
  .promo-btn { width: 19%; aspect-ratio: 1; padding: 4px; background: var(--panel); border-color: var(--rule); }
  .promo-cancel { flex-basis: 100%; max-width: 160px; }
</style>
