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

- [x] **Exercise the Cloudflare path.** Done 2026-10-12, locally in workerd via
      `wrangler dev`, so no account was needed after all. `npm run test:worker`
      (`packages/server/test-worker/do-check.mjs`) now covers it: the HTTP surface, a
      two-client game with a capture transferred across boards, broadcast seq
      contiguity, seat reclaim by token, and the alarm, proved by a 1+0 game flagging
      on its own after 60s with nothing sent from the client. The full Playwright suite
      also passes against the worker, since both target :8788.

      It found three real bugs on first run, none of which the Node host could reveal:

      1. `export const SCHEMA` aborted worker startup outright — the runtime requires
         every named export of the entry module to be a handler or a Durable Object
         class. It was also dead code duplicating `migrations/0001_games.sql`, so it
         was deleted rather than moved.
      2. An unguarded D1 read in the replay route turned a failed query into an
         uncaught throw: a bare 500 in production, and under `wrangler dev` a stack
         trace carrying absolute filesystem paths. It now degrades to a clean 503.
         Verified by dropping the `games` table and re-requesting.
      3. The claim-window busy loop below.

- [x] **Stop the claim-window busy loop.** Found by the probe that `zz-probe.test.ts`
      left behind, which asserted the pathology rather than fixing it.
      `nextDeadline()` proposed `disconnectedSince + CLAIM_AFTER_MS` unconditionally.
      Reaching that moment only flips `claimable`, so applying it never removed it: the
      host scheduled `max(0, at - now)` = 0, woke immediately and was handed the same
      past moment again, spinning until the player reconnected or a clock flagged — up
      to half an hour on a 30+0 game. Harmless-looking on Node; on Durable Object
      alarms every spin is a billable request.

      `nextDeadline(now)` now takes the time and proposes the claim window only while
      it is still ahead. Every other candidate already ended the game or cleared an
      offer when reached, so each one removed itself; this was the only informational
      deadline. `test/claim-deadline.test.ts` replaces the probe with four real tests,
      and restoring the old line fails two of them (`expected -3000 to be greater
      than 0`, `expected 0 to be greater than 0`).

- [ ] **Decide what an idle open tab should cost.** Needs a decision, not code. Deployed
      2026-10-12 on the Workers Free plan, where the limits are 100,000 requests/day
      and 13,000 GB-s/day of duration, and *exceeding one makes further operations of
      that type fail* until 00:00 UTC rather than billing. Failing operations here means
      alarms, which means clocks stop flagging.

      Duration is the binding constraint, because `durable-object.ts` calls
      `server.accept()` and the docs are explicit: "Calling `accept()` on a WebSocket in
      an Object will incur duration charges for the entire time the WebSocket is
      connected." At the billed 0.125 GB that is 10,800 GB-s for one tab left open for a
      day, against a 13,000 GB-s daily allowance. Two overnight tabs exhaust it.

      Actual games are cheap, so this is not about usage. A 10-minute game is about 75
      GB-s, roughly 170 games a day, and duration is shared across an object rather than
      per connection, so a table costs the same with two players as with one. The cost is
      entirely tabs left open while nothing is happening.

      Already done: the probe cadence drops to 30s outside a live game
      (`IDLE_PROBE_EVERY_MS`), which cut an open tab from 17,280 alarms a day to 2,880
      and put requests comfortably inside the allowance. Verified on production that a
      lobby socket still survives 5.5 minutes of waiting at that cadence. It does nothing
      for duration, which accrues from the open socket itself.

      Three ways out, in increasing order of work:

      1. **Close idle sockets.** When the phase is `setup` or `over` and nothing has
         arrived for a few minutes, close them; the object then evicts and duration
         stops. Cheapest, and needs no persistence. Costs a reconnect affordance for
         someone sitting in a lobby waiting on a friend.
      2. **The WebSocket Hibernation API.** The actual fix — `state.acceptWebSocket()`
         instead of `accept()`, so clients stay connected while the object is evicted and
         duration does not accrue. It resets in-memory state, so it needs the Room to
         rehydrate from storage: the P2 item below, which was declined for good reasons
         that this does not change. It would also fix deploys killing live games.
      3. **Workers Paid, about $5/mo.** 400,000 GB-s/month pools where the free tier is
         daily, so one always-open tab is roughly 324,000 GB-s/month and fits. More to
         the point, overage bills instead of failing, so the failure mode stops being
         "clocks silently stop".

## P2 — before anyone plays for stakes

- [ ] **Survive a server restart.** Rooms live in instance memory, so a deploy during a
      game drops it. Persist the Room to Durable Object storage on each action and
      rehydrate on wake. Tolerable for a friendly game; not tolerable for a rated one.

      Knowingly declined for the first deployment on 2026-10-12: the site is for people
      who play on the spot and finish before leaving, and deploys will be rare. Worth
      recording that on Cloudflare the exposure is narrower than it first looks. A
      single player dropping is already safe — the other player's socket keeps the
      object in memory, and the seat is reclaimed by token. Only a *simultaneous* drop
      loses the game, and `VOID_AFTER_MS` (room.ts) already voids a game when both
      players stay away, so the product treats that as a dead game regardless. What is
      left is: every deploy kills every live game, and after an eviction `alarm()` finds
      `this.hub` null and does nothing. The latter is not a hang — `getHub()` builds a
      fresh `Room`, so a cold object serves an empty table at the same URL.
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
