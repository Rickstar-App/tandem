# Tandem

Online bughouse chess for two people, where **each player controls both boards**.

You play White on Board A and Black on Board B; your opponent holds the other side of each.
Every piece you capture on one board lands in your own reserve on the other, to drop on an empty
square. Each board has its own clock, so you cannot leave one alone.

- **What to build and why:** [BRIEF.md](BRIEF.md) — product, rules, interaction, architecture, quality bars.
- **How it should look:** [DESIGN.md](DESIGN.md) and [design/tokens.css](design/tokens.css).
- **The whole thing in one document:** [MASTER_DESIGN.md](MASTER_DESIGN.md) / [MASTER_DESIGN.pdf](MASTER_DESIGN.pdf).
- **Licences:** [THIRD_PARTY.md](THIRD_PARTY.md).

## Run it

```bash
npm install
npm start          # builds the client and serves everything on http://localhost:8787
```

For development with hot reload, run the server and the client separately:

```bash
npm run dev:server   # API and WebSocket on :8787
npm run dev:web      # Vite on :5173, proxying /api and /ws to :8787
```

## Test it

```bash
npm test             # engine + server unit and integration tests (Vitest)
npm run test:e2e     # end-to-end in a real browser at three widths (Playwright + axe)
npm run typecheck    # tsc for engine and server, svelte-check for the client
```

## Layout

| Path | What it is |
|---|---|
| `packages/engine` | The rules. Pure TypeScript, no DOM, no network, no clocks. |
| `packages/server` | Authoritative room state, clocks and protocol, plus a Node adapter and a Cloudflare Durable Object adapter. |
| `packages/web` | Svelte 5 client: lobby, game, replay, spectator view, rules. |
| `e2e` | Playwright specs: gameplay, flows, layout, accessibility, performance. |
| `design` | Tokens, fonts, pieces and the rendered design reference. |

### How the pieces fit

The engine knows the rules and nothing else. The server owns time: it holds the only authoritative
clocks, decides legality, and serialises every event so the two boards can never disagree. The
client renders what the server sends and asks for actions; it runs the same engine locally only to
show legal targets and to hold a premove.

`packages/server/src/room.ts` is a state machine that takes `now` as an argument everywhere, so
every clock rule (flags, the lag credit, simultaneous flags, abort, abandonment) is tested
deterministically rather than by waiting.

### Where to make a change

| You want to change | Open |
|---|---|
| A rule of the game | `packages/engine/src/board.ts` (one board) or `game.ts` (the pair) |
| How a move is written or parsed | `packages/engine/src/notation.ts` |
| Clocks, draws, rematch, abandonment | `packages/server/src/room.ts` |
| A protocol message, rate limit, or reconnect | `packages/server/src/hub.ts` and `types.ts` |
| An HTTP route or the dev server | `packages/server/src/node-main.ts` |
| Anything about deploying to Cloudflare | `packages/server/src/durable-object.ts`, `wrangler.toml` |
| How a board or piece looks | `packages/web/src/components/Board.svelte`, `Piece.svelte` |
| The two-board layout or the phone fallback | `packages/web/src/components/BoardPair.svelte` |
| A colour, size, space or duration | `design/tokens.css`, mirrored in `packages/web/src/app.css` |
| A screen | `packages/web/src/routes/` |

## Deploying

The production target is Cloudflare Workers with one Durable Object per game and D1 for finished
games.

```bash
cd packages/server
npx wrangler d1 create tandem          # paste the returned id into wrangler.toml
npx wrangler d1 migrations apply tandem --remote
npm run build -w @tandem/web           # wrangler serves packages/web/dist as the SPA
npx wrangler deploy
```

Without a D1 binding the game still plays; only the replay route returns 503, which the client
shows as a plain message.

The Node adapter in `packages/server/src/node-main.ts` runs the same room logic and is what the
tests and local development use. It is also the defined fallback host if Durable Objects prove
unsuitable (BRIEF §6.1).

## What is deliberately absent

No accounts, ratings, matchmaking, chat or dark mode in v1. No threefold repetition, fifty-move
rule or insufficient-material draw: bughouse has no standard definition for them and the clocks
always end the game. The rules page says so in as many words.
