# Tandem

Online bughouse chess for two people, where **each player controls both boards**.

**Live: https://tandem.tandem-server.workers.dev**

You hold White on Board A and Black on Board B. Your opponent holds the other side of each. Every
piece you capture on one board arrives in your own reserve on the other, to drop on any empty
square. Each board runs its own clock, so you cannot leave either one alone.

```
        BOARD A                      BOARD B
   you: White ──────── capture ────▶ your reserve
   them: Black ◀─── capture ──────── them: White
                                     you: Black
```

## Why this is not crazyhouse, and not bughouse either

In **crazyhouse**, one board, and you drop what you capture yourself. In **bughouse**, four
players on two boards, and you drop what your *partner* captures. Tandem keeps bughouse's rules
exactly — the transfer, the drops, the per-board clocks — but hands both seats of a partnership to
one person.

That changes the game rather than just the staffing. In bughouse you ask your partner for a
bishop. Here you have to go and win the bishop yourself, on the other board, on a clock that is
also running. The skill is no longer co-ordination, it is divided attention.

## The rules, including the parts that are easy to get wrong

Specified in full in [BRIEF.md](BRIEF.md) §3. The cases that actually matter:

**Transfer.** A capture on one board adds the piece to the partner seat's reserve on the other,
available the next time that seat has the move. Colour never changes: a White piece captured on
Board A goes to the White seat on Board B, still White. Every reserve holds only its own colour.

**Counterfeits.** A promoted piece carries a `promoted` flag from promotion onward. Capture a
promoted queen and you receive a **pawn**, not a queen. The flag follows the piece as it moves, and
the UI marks it with a two-tone corner wedge — shape, not colour, so it reads on both sides.

**Pending is not checkmate.** This is the rule most implementations get wrong. If your king is
attacked and you have no legal action *right now*, you are only mated if no drop could ever block:
double check, a knight or pawn attacker, or a slider with no empty square between it and your king.
If exactly one slider attacks with a gap, you are **pending** — not mated. Your clock keeps running
and you may act the moment your reserve gives you a block. Since your partner seat is also you, you
can usually go and win the piece you need, if the clock allows.

**No stalemate.** A side with no legal action that is *not* in check is "stuck", not drawn. It
waits with its clock running. If neither seat on a board can act, that board freezes until a
reserve or a clock changes.

**Drops.** Any empty square, except pawns never on rank 1 or 8. A pawn dropped on its own second
rank may still advance two squares; one dropped elsewhere may not. En passant works against dropped
pawns. A dropped rook has never moved, so it can still castle. Kings are never dropped.

**Clocks.** Four of them, one per seat, classic bughouse. Running out loses on that board. Two
clocks can flag at the same instant, which is a draw.

There is one known gap, written up honestly rather than hidden: [BRIEF.md](BRIEF.md) §3.8a
describes a reachable position where the correct play is to make no play, and the game becomes a
clock race with no chess in it. `packages/server/test/stall.test.ts` reaches it in two tests. The
rule to fix it is a decision about the game, so it is still open in [TODOS.md](TODOS.md).

## Run it

Needs Node 24 or newer — the server runs TypeScript directly through Node's own type stripping,
with no build step. Built and tested on Node 26.7.

```bash
npm install
npm start          # builds the client, serves everything on http://localhost:8787
```

For development with hot reload, run the two halves separately:

```bash
npm run dev:server   # API and WebSocket on :8787
npm run dev:web      # Vite on :5173, proxying /api and /ws to :8787
```

To run the real Cloudflare stack locally, in workerd, with no account:

```bash
npm run build
cd packages/server
npx wrangler d1 migrations apply bughouse --local   # once
npx wrangler dev --port 8788 --local
```

## Test it

```bash
npm test             # engine + server, deterministic, no waiting on wall-clock time
npm run test:e2e     # real browser at three widths, plus axe and a measured LCP
npm run test:worker  # the Cloudflare adapter, against a running wrangler dev
npm run typecheck    # tsc for engine and server, svelte-check for the client
```

Current: **81 engine**, **68 server**, **33 e2e**, **15 worker checks**.

Both suites can be pointed at a deployment instead of localhost, which is how several bugs that
localhost could not expose were found:

```bash
TANDEM_BASE_URL=https://tandem.tandem-server.workers.dev npm run test:e2e
WORKER_URL=https://tandem.tandem-server.workers.dev npm run test:worker
```

### How the tests try to be worth trusting

A passing test proves nothing unless it could have failed. So:

- **Mutation tested.** Rules are deliberately broken to confirm a test catches it. Reverting the
  claim-window fix fails two tests with `expected -3000 to be greater than 0`; reverting the probe
  cadence fails two with `expected 5000 to be 30000`.
- **Checked against an outside oracle.** `packages/engine/test/oracle.test.ts` cross-checks move
  generation against lichess's [chessops](https://github.com/niklasf/chessops) Crazyhouse
  implementation by perft. It is a dev dependency only and is not in the shipped bundle.
- **Time is injected, never awaited.** `packages/server/src/room.ts` takes `now` as a parameter
  everywhere, so flags, lag credit, simultaneous flags, abort and abandonment are all tested by
  passing a number rather than sleeping. The suite runs in seconds and does not flake on a loaded
  machine.
- **Property and invariant tests** generate games and assert things that must always hold, rather
  than only checking hand-picked positions.
- **The deployment is tested, not assumed.** `test:worker` drives a real game over a WebSocket and
  waits out an actual 60-second clock flag to prove the Durable Object alarm fires with no client
  input.

## Architecture

The engine knows the rules and nothing else — no DOM, no network, no clocks. The server owns time:
it holds the only authoritative clocks, decides legality, and serialises every event so the two
boards can never disagree. The client renders what the server sends and asks for actions; it runs
the same engine locally only to show legal targets and to hold a premove.

The server is transport-agnostic. `Hub` handles connections and knows nothing about how they
arrived, so the same room logic runs under two hosts: a plain Node process with `ws`, and a
Cloudflare Durable Object, one object per game. The host supplies `now` and a `setTimer`, which is
a `setTimeout` in one case and a Durable Object alarm in the other.

| Path | What it is |
|---|---|
| `packages/engine` | The rules. Pure TypeScript. |
| `packages/server` | Room state, clocks, protocol, and both host adapters. |
| `packages/web` | Svelte 5 client: lobby, game, replay, spectator view, rules. |
| `e2e` | Playwright: gameplay, flows, layout, accessibility, performance. |
| `design` | Tokens, fonts, pieces, rendered design reference. |

### Where to make a change

| You want to change | Open |
|---|---|
| A rule of the game | `packages/engine/src/board.ts` (one board) or `game.ts` (the pair) |
| How a move is written or parsed | `packages/engine/src/notation.ts` |
| Clocks, draws, rematch, abandonment | `packages/server/src/room.ts` |
| A protocol message, rate limit, reconnect | `packages/server/src/hub.ts` and `types.ts` |
| An HTTP route or the dev server | `packages/server/src/node-main.ts` |
| Anything about Cloudflare | `packages/server/src/durable-object.ts`, `wrangler.toml` |
| How a board or piece looks | `packages/web/src/components/Board.svelte`, `Piece.svelte` |
| The two-board layout or the phone fallback | `packages/web/src/components/BoardPair.svelte` |
| A colour, size, space or duration | `design/tokens.css`, mirrored in `packages/web/src/app.css` |
| A screen | `packages/web/src/routes/` |

## Design

The look is a decided position, not a default: see [DESIGN.md](DESIGN.md) and
[design/tokens.css](design/tokens.css). Warm paper, square corners, no shadows, no gradients, no
translucency. Board A is clay, Board B is deep teal, and colour is never the only cue — each board
also carries a letter badge and a fixed position. Atkinson Hyperlegible Next for the UI and the
clocks (tabular figures verified), Zilla Slab for titles only.

Every colour, size, space, radius and duration comes from a token; anything else is a defect.
[DESIGN.md](DESIGN.md) carries a rejection checklist aimed squarely at generic AI-generated
styling, and the three things deliberately outside the token set are named and justified rather
than left as exceptions.

## Deploying

Production is Cloudflare Workers: one Durable Object per game, D1 for finished games, and the built
client served as static assets from the same Worker.

```bash
npx wrangler login
npx wrangler d1 create bughouse        # put the returned uuid in wrangler.toml as database_id
cd packages/server
npx wrangler d1 migrations apply bughouse --remote
npm run build -w @tandem/web           # wrangler serves packages/web/dist as the SPA
npx wrangler deploy
```

`wrangler d1 migrations apply` resolves the database **by name** while the binding resolves by id,
so `database_name` in `wrangler.toml` has to match what the database is actually called.

Durable Objects run on the **Workers Free** plan as long as the class is SQLite-backed, which
`[[migrations]] new_sqlite_classes` makes it. No paid plan is required.

Without a D1 binding the game still plays; only the replay route returns 503, which the client
shows as a plain message.

### Two things worth knowing before you leave it running

**A deploy ends every game in progress.** Rooms live in the Durable Object's memory and are not
persisted, and deploying a new version restarts every object. Fine for friends playing on the spot;
not fine for anything rated. The fix is written up in [TODOS.md](TODOS.md).

**An idle open tab is the main hosting cost.** The Worker accepts WebSockets with `accept()` rather
than the Hibernation API, and Cloudflare bills duration "for the entire time the WebSocket is
connected". At the billed 0.125 GB that is ~10,800 GB-s for a tab left open a day, against a 13,000
GB-s/day free allowance — and on the free plan an exceeded limit makes operations *fail*, not bill,
which here means clocks stop flagging. Actual games are cheap: ~75 GB-s for ten minutes, roughly
170 games a day. The round-trip probe already drops to 30s outside a live game, which keeps
requests well inside the allowance; duration still needs a decision, and the three options are in
[TODOS.md](TODOS.md).

## Status

Playable and deployed. Rules, clocks, drops, transfers, premoves, draws, rematch, spectating,
replay, keyboard play and the accessibility audit are all implemented and covered by tests that
have been shown to fail when the behaviour is broken.

Not yet done, in [TODOS.md](TODOS.md) with the reasoning for each: one full game against a second
human (the brief asks for it and it has not happened), the pending-stall rule, surviving a restart,
observability, and a computer opponent — which is the one thing that would let a single person open
the site and play.

## What is deliberately absent

No accounts, ratings, matchmaking, chat or dark mode in v1. No threefold repetition, fifty-move
rule or insufficient-material draw: bughouse has no standard definition for them and the clocks
always end the game. The rules page says so in as many words.

## Documents

- **What to build and why:** [BRIEF.md](BRIEF.md) — product, rules, interaction, architecture, quality bars.
- **How it should look:** [DESIGN.md](DESIGN.md), [design/tokens.css](design/tokens.css).
- **Everything in one document:** [MASTER_DESIGN.md](MASTER_DESIGN.md) / [MASTER_DESIGN.pdf](MASTER_DESIGN.pdf).
- **What is left and why:** [TODOS.md](TODOS.md).
- **Licences:** [THIRD_PARTY.md](THIRD_PARTY.md) — Cburnett pieces (CC BY-SA 3.0), fonts (OFL), each verified at source.
