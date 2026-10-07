<script lang="ts">
  import { type Board, type Game, apply, gameFrom, parseFen, parseSan, status } from '@tandem/engine';
  import { statusWords } from '../lib/view.ts';
  import TopBar from '../components/TopBar.svelte';
  import BoardView from '../components/Board.svelte';

  /** A small worked example: set a position, let the reader make the one move that shows the rule. */
  type Demo = {
    id: string;
    fenA: string;
    fenB?: string;
    play?: string;
    board?: Board;
    caption: string;
  };

  function build(d: Demo): Game {
    const a = parseFen(d.fenA);
    const b = parseFen(d.fenB ?? '4k3/8/8/8/8/8/8/4K3[] w - - 0 1');
    return gameFrom(a.pos, b.pos, { A: a.pockets, B: b.pockets });
  }

  let states = $state<Record<string, Game>>({});
  function gameFor(d: Demo): Game { return states[d.id] ?? build(d); }
  function reset(d: Demo) { states = { ...states, [d.id]: build(d) }; }
  function doPlay(d: Demo) {
    const g = gameFor(d);
    const b = d.board ?? 'A';
    const a = d.play ? parseSan(g, b, d.play) : null;
    if (a) states = { ...states, [d.id]: apply(g, b, a).game };
  }

  const drop: Demo = {
    id: 'drop',
    fenA: '4k3/8/8/8/8/8/8/4K3[N] w - - 0 1',
    play: 'N@e5',
    caption: 'White holds a knight in reserve. Dropping it on any empty square is a whole turn.',
  };
  const counterfeit: Demo = {
    id: 'counterfeit',
    fenA: 'r3k3/8/8/8/8/8/8/Q~3K3[] b - - 0 1',
    play: 'Rxa1',
    board: 'A',
    caption: 'That white queen was promoted from a pawn (note the mark). Captured, it goes to the reserve as a pawn.',
  };
  const pending: Demo = {
    id: 'pending',
    fenA: '6k1/5ppp/8/8/8/8/8/R3K3[] w - - 0 1',
    play: 'Ra8',
    caption: 'Black has no legal reply, but a piece dropped on e8, f8 or g8 would block. Not mate: Black waits, clock running.',
  };
  const realMate: Demo = {
    id: 'mate',
    fenA: '6rk/6pp/8/8/8/8/8/4K3[N] w - - 0 1',
    play: 'N@f7',
    caption: 'A knight check cannot be blocked by any drop, so this is mate.',
  };
  const stuck: Demo = {
    id: 'stuck',
    fenA: 'k7/8/1Q6/8/8/8/8/4K3[] b - - 0 1',
    caption: 'Black has no legal move and is not in check. In chess that is stalemate; here Black simply waits for a piece, clock running.',
  };
  const castle: Demo = {
    id: 'castle',
    fenA: '4k3/8/8/8/8/8/8/4K3[R] w K - 0 1',
    play: 'R@h1',
    caption: 'A rook dropped on its home corner may still castle, as long as the king has not moved.',
  };
  const demos = [drop, counterfeit, pending, realMate, stuck, castle];
</script>

<TopBar />

<main class="page rules">
  <h1>How Tandem bughouse works</h1>
  <p class="lead">
    Two people play. Each controls both boards. You are White on Board A and Black on Board B;
    your opponent holds the other side of each. The two boards run at the same time.
  </p>

  <h2>The one rule that changes everything</h2>
  <p>
    When you capture a piece on one board, it goes into your own reserve on the other board.
    On your turn there you may place it on any empty square instead of moving. That is a drop.
  </p>

  <div class="demos">
    {#each demos as d (d.id)}
      {@const g = gameFor(d)}
      <figure>
        <div class="mini">
          <BoardView board={d.board ?? 'A'} game={g} compact />
        </div>
        <figcaption>
          <p>{d.caption}</p>
          <div class="row">
            {#if d.play}
              <button class="quiet" onclick={() => doPlay(d)}>Play {d.play}</button>
            {/if}
            <button class="quiet" onclick={() => reset(d)}>Reset</button>
            <span class="small muted state">
              {statusWords(status(g, d.board ?? 'A'), g.pos[d.board ?? 'A'].turn)}
            </span>
          </div>
        </figcaption>
      </figure>
    {/each}
  </div>

  <h2>Every rule, in order</h2>
  <dl>
    <dt>Turns</dt>
    <dd>On your turn on a board you either move a piece or drop one from that board's reserve.</dd>

    <dt>Drops</dt>
    <dd>
      A dropped piece goes on any empty square. Pawns may never be dropped on the first or last rank.
      A pawn dropped on its own second rank may still advance two squares, and can be taken en passant.
      A drop may give check, and may give checkmate.
    </dd>

    <dt>Promotion</dt>
    <dd>
      Pawns promote to a queen, rook, bishop or knight. A promoted piece carries a small mark.
      If it is captured it returns to the reserve as a pawn, not as the piece it became.
    </dd>

    <dt>Checkmate</dt>
    <dd>
      A check that a dropped piece could block is <b>not</b> checkmate, even when the reserve is
      empty, because a piece may arrive from the other board at any moment. Mate therefore needs a
      check that no drop can block: a contact check, a knight or pawn check, a double check, or a
      sliding check with no gap between the piece and the king.
    </dd>

    <dt>No stalemate</dt>
    <dd>
      A player with no legal move who is not in check is not stalemated and the game is not drawn.
      They wait, with their clock running, until a piece reaches them or they run out of time.
    </dd>

    <dt>Castling</dt>
    <dd>
      Normal castling rules apply. A rook dropped onto its home corner may take part in castling if
      the king has not moved. Rulesets disagree on this point; Tandem allows it.
    </dd>

    <dt>Clocks</dt>
    <dd>
      Each of the four seats has its own clock, so you have two: one per board. Only the side to
      move burns time. Running out on either board loses the whole game, even if your opponent
      could never mate you.
    </dd>

    <dt>Ending</dt>
    <dd>
      Checkmate or a flag on <b>either</b> board ends the whole game. Resigning ends both boards.
      A draw needs both players to agree, or two clocks to run out at the same instant, one on each team.
    </dd>

    <dt>Not in this game</dt>
    <dd>
      There is no threefold repetition, no fifty-move rule and no insufficient-material draw.
      Reserves and the other board keep changing the position, no standard definition exists for
      bughouse, and the clocks always end the game. This is deliberate, not an oversight.
    </dd>
  </dl>

  <h2>Playing</h2>
  <dl>
    <dt>Moving</dt>
    <dd>Drag a piece, or click it and click a square. Drops work the same way from the reserve.</dd>
    <dt>Typing</dt>
    <dd>
      Press <kbd>/</kbd> and type a move: <code>a e4</code>, <code>b N@f3</code>, <code>a O-O</code>.
      Leave the board letter off when only one board is yours to move. <kbd>Tab</kbd> completes.
    </dd>
    <dt>Premoves</dt>
    <dd>You may queue one action per board while you wait. It plays the moment your turn arrives, or is dropped if it has become illegal.</dd>
    <dt>Keyboard</dt>
    <dd>Arrow keys move a cursor on a focused board, <kbd>Enter</kbd> selects and places, <kbd>Esc</kbd> cancels everything queued.</dd>
  </dl>

  <h2>Credits</h2>
  <p class="small muted">
    Chess pieces by Cburnett, licensed
    <a href="https://creativecommons.org/licenses/by-sa/3.0/" rel="noreferrer">CC BY-SA 3.0</a>.
    Type is Atkinson Hyperlegible Next and Zilla Slab, both under the SIL Open Font License 1.1.
  </p>
  <p><a href="/">Set up a table</a></p>
</main>

<style>
  .rules { max-width: 72ch; }
  .lead { font-size: 1.0625rem; }
  .demos { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--s-5); margin: var(--s-5) 0; }
  figure { margin: 0; }
  .mini { max-width: 220px; }
  figcaption p { margin: var(--s-2) 0; font-size: var(--fs-small); }
  .row { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
  .row button { min-height: 32px; padding: var(--s-1) var(--s-2); font-size: var(--fs-small); }
  .state { font-variant-numeric: tabular-nums; }
  dl { margin: 0 0 var(--s-5); }
  dt { font-weight: 800; margin-top: var(--s-3); }
  dd { margin: var(--s-1) 0 0; }
  code, kbd {
    font: inherit; border: 1px solid var(--rule); border-radius: var(--radius);
    padding: 0 4px; background: var(--panel);
  }
</style>
