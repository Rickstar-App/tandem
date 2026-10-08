# TODOS

Deferred by the `/autoplan` review on 2026-10-08. Each item says why it was not done
now, so the reasoning does not have to be rediscovered.

## P0 — the cheapest thing that could change the plan

- [ ] **Play one full game against a second human.** BRIEF §12 Gate 3 asks for exactly
      this and it has never happened. 81 engine tests, 58 server tests and 30 browser
      checks say the rules are right and the screens work; none of them say the game is
      any good. §0's bet (that holding both boards beats having a partner) is untested,
      and so is the 5+0 default, which gives roughly half the per-decision time of
      standard bughouse because two boards can run at once. One hour, two people.

- [ ] **Decide the pending stall rule.** BRIEF §3.8a. There is a reachable position
      where the correct play is to make no play, and the game becomes a clock race with
      no chess in it. `packages/server/test/stall.test.ts` reaches it in two tests.
      Three candidate rules are written up; the cheapest is letting a pending side claim
      a draw after N seconds. This is a decision about the game, not the code.

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

The strategic review landed on this hard, and its argument is better than the one this
plan started with. The demand signal for a solo bughouse variant is specifically demand
for *less* waiting on a partner. A product reachable only by texting a link to a
specific person who is awake and at a keyboard reinstates that wait in a harder form.

- [ ] **Ship a computer opponent.** Moved out of BRIEF §4.2, where it sat in a one-line
      list beside "dark theme". It is not a peer of those exclusions: it is the only one
      that decides whether a single person can open the site and play. The engine is
      already built, transport-free and verified against an external oracle, so a bot
      over `legal()` is comparatively cheap. It turns the hardest constraint into none.

- [ ] **A pairing queue.** Not accounts, not ratings: a server-side waiting list keyed
      on time control, and a "play now" button. The room infrastructure already
      serializes games; this is the smallest thing that answers "who do I play with?".

- [ ] **Reachable replay.** Finished games persist for 90 days but there is no way to
      find one unless the player saved the URL before closing the tab. Either add a
      `/mine` route backed by the existing seat token, or stop persisting.

- [ ] **Full matchmaking with accounts and ratings.** The large version. Needs presence
      and abuse handling as well. Out of blast radius; listed last on purpose.

- [ ] **Reconsider the name.** "Tandem" means two people working together, which names
      four-player bughouse rather than this. Worth ten minutes before anyone sees it.

## P4 — small, cheap, worth doing

- [ ] **A distinct first-load failure state.** If the server is unreachable when the
      page opens, the player sees "Connecting…" forever. It should say what went wrong
      and offer a retry. One component.
