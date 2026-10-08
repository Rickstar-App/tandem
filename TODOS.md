# TODOS

Deferred by the `/autoplan` review on 2026-10-08. Each item says why it was not done
now, so the reasoning does not have to be rediscovered.

## P1 — before this is deployed anywhere real

- [ ] **Exercise the Cloudflare path.** `packages/server/src/durable-object.ts`
      typechecks and mirrors the Node adapter, but nothing has ever run it. Run
      `wrangler dev`, play a game through it, and add a smoke test. This is the only
      codepath in the project with no coverage, and it is the production one.
      *Deferred because it needs a Cloudflare account, which is the user's to create.*

## P2 — before anyone plays for stakes

- [ ] **Survive a server restart.** Rooms live in instance memory, so a deploy during a
      game drops it. Persist the Room to Durable Object storage on each action and
      rehydrate on wake. Tolerable for a friendly game; not tolerable for a rated one.
- [ ] **Add observability.** Today the server logs one line at startup. No counters for
      games started, finished, flagged, aborted or abandoned; no error log. The first
      question after deploying is "is anyone playing" and there is currently no way to
      answer it.

## P3 — the thing that would actually make it a product

- [ ] **Answer "who do I play with?"** The plan deliberately excluded accounts, ratings
      and matchmaking (BRIEF §4.2), and for a first version that was right. But it
      means a player whose friend is offline has nothing to do. This is the highest
      value next move and the largest: it needs accounts, a lobby, presence and abuse
      handling. Out of blast radius for the current work, which is why it is here and
      not in the build.

## P4 — small, cheap, worth doing

- [ ] **A distinct first-load failure state.** If the server is unreachable when the
      page opens, the player sees "Connecting…" forever. It should say what went wrong
      and offer a retry. One component.
