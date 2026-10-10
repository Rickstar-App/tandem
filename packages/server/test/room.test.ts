import { beforeEach, describe, expect, it } from 'vitest';
import { parseFen, parseSan, parseSq as S } from '@tandem/engine';
import { Room, ABORT_MS, CLAIM_AFTER_MS, COUNTDOWN_MS, DRAW_OFFER_MS, DRAW_REOFFER_BLOCK_MS, FINISHED_ROOM_TTL_MS, REMATCH_MS, TABLE_EXPIRY_MS, VOID_AFTER_MS, cleanName, validTimeControl } from '../src/room.ts';
import { SeatId, Team } from '../src/types.ts';

const T0 = 1_700_000_000_000;
let n = 0;
const deps = { newToken: () => `tok${++n}`, rnd: () => 0.25 };

/** Replace one board's position and reserve, for positions that are tedious to reach by play. */
function setBoard(r: Room, board: 'A' | 'B', fen: string) {
  const { pos, pockets } = parseFen(fen);
  r.game.pos[board] = pos;
  r.game.reserve[board] = pockets;
}

function table(tc = { baseMin: 5, incSec: 0 }) {
  const r = new Room('tbl1', deps, T0);
  const host = r.join({ type: 'join', name: 'Host' }, T0);
  r.setup(host.team!, { type: 'setup', tc }, T0);
  const guest = r.join({ type: 'join', name: 'Guest' }, T0);
  return { r, host: host.team!, guest: guest.team!, hostTok: host.token!, guestTok: guest.token! };
}
/** Ready both sides and run out the countdown so clocks are live at `at`. */
function start(r: Room, at = T0) {
  r.setReady('WA', true, at); r.setReady('BA', true, at);
  r.tick(at + COUNTDOWN_MS);
  return at + COUNTDOWN_MS;
}
/** Play SAN on a board as the team that holds it. */
function play(r: Room, board: 'A' | 'B', text: string, now: number, rtt = 0) {
  const a = parseSan(r.game, board, text);
  if (!a) throw new Error(`illegal in test: ${board} ${text}`);
  const color = r.game.pos[board].turn;
  const team: Team = (board === 'A') === (color === 'w') ? 'WA' : 'BA';
  return r.act(team, board, { type: 'action', board, action: a as never }, now, rtt);
}

describe('seating and setup', () => {
  it('host takes their chosen team, guest takes the other, spectators get no seat', () => {
    const r = new Room('x', deps, T0);
    const h = r.join({ type: 'join', name: 'Host' }, T0);
    expect(h.team).toBe('WA');
    r.setup('WA', { type: 'setup', team: 'BA' }, T0);
    expect(r.teamByToken(h.token!)).toBe('BA');
    const g = r.join({ type: 'join', name: 'Guest' }, T0);
    expect(g.team).toBe('WA');
    const s = r.join({ type: 'join', name: 'Watcher' }, T0);
    expect(s.team).toBeNull();
    expect(r.snapshot(T0).spectators).toBe(1);
  });
  it('a random team choice is resolved at the start of the game, not before', () => {
    let k = 0;
    const r = new Room('x', { newToken: () => `t${++k}`, rnd: () => 0.9 }, T0);
    const h = r.join({ type: 'join', name: 'H' }, T0);
    r.setup(h.team!, { type: 'setup', team: 'random' }, T0);
    r.join({ type: 'join', name: 'G' }, T0);
    expect(r.snapshot(T0).hostTeam).toBe('random');
    start(r);
    expect(r.phase).toBe('playing');
    expect(r.teamByToken(h.token!)).toBe('BA'); // rnd 0.9 -> host seated on BA
  });
  it('any setup change clears both ready flags, and the guest cannot change setup', () => {
    const { r, host, guest } = table();
    r.setReady(host, true, T0);
    expect(r.setup(guest, { type: 'setup', tc: { baseMin: 3, incSec: 2 } }, T0).ok).toBe(false);
    r.setup(host, { type: 'setup', tc: { baseMin: 3, incSec: 2 } }, T0);
    expect(r.ready).toEqual({ WA: false, BA: false });
    expect(r.tc).toEqual({ baseMin: 3, incSec: 2 });
  });
  it('rejects out-of-range time controls', () => {
    for (const bad of [{ baseMin: 0, incSec: 0 }, { baseMin: 31, incSec: 0 }, { baseMin: 5, incSec: 11 }, { baseMin: 1.5, incSec: 0 }]) {
      expect(validTimeControl(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(validTimeControl({ baseMin: 30, incSec: 10 })).toBe(true);
  });
  it('cleans guest names and falls back to Guest####', () => {
    expect(cleanName('  Mara_B-1.  ')).toBe('Mara_B-1.');
    expect(cleanName('<script>x</script>')).toBe('scriptxscript');
    expect(cleanName('', () => 0.1234)).toBe('Guest1234');
    expect(cleanName('x'.repeat(50)).length).toBe(20);
  });
  it('an unjoined table expires after 30 minutes, a joined one does not', () => {
    const r = new Room('x', deps, T0);
    r.join({ type: 'join', name: 'H' }, T0);
    expect(r.isExpired(T0 + 1_800_001)).toBe(true);
    r.join({ type: 'join', name: 'G' }, T0);
    expect(r.isExpired(T0 + 1_800_001)).toBe(false);
  });
});

describe('clocks', () => {
  it('only the side to move on each board burns time, and the start is the countdown end', () => {
    const { r } = table();
    const t = start(r);
    expect(r.running().sort()).toEqual(['A-w', 'B-w']);
    r.tick(t + 10_000);
    const s = r.snapshot(t + 10_000);
    expect(s.clocks['A-w']).toBe(290_000);
    expect(s.clocks['B-w']).toBe(290_000);
    expect(s.clocks['A-b']).toBe(300_000);
    expect(s.clocks['B-b']).toBe(300_000);
  });
  it('the clock passes to the other seat on that board only', () => {
    const { r } = table();
    const t = start(r);
    play(r, 'A', 'e4', t + 4_000);
    r.tick(t + 10_000);
    const s = r.snapshot(t + 10_000);
    expect(s.clocks['A-w']).toBe(296_000);   // stopped after 4s
    expect(s.clocks['A-b']).toBe(294_000);   // ran for the last 6s
    expect(s.clocks['B-w']).toBe(290_000);   // unaffected by board A
  });
  it('a stuck side keeps burning time and flags (BRIEF §3.5, §3.7)', () => {
    const { r } = table({ baseMin: 1, incSec: 0 });
    const t = start(r);
    // Black on A is stuck: no legal action, not in check, and an empty reserve.
    setBoard(r, 'A', 'k7/8/1Q6/8/8/8/8/4K3 b - - 0 1');
    expect(r.snapshot(t).status.A).toBe('stuck');
    expect(r.running()).toContain('A-b');
    const ev = r.tick(t + 61_000);
    expect(r.phase).toBe('over');
    expect(r.result!.reason).toBe('flag');
    expect(r.result!.winner).toBe('WA');   // A-b belongs to BA, so WA wins
    expect(ev.events.some(e => e.type === 'ended')).toBe(true);
  });
  it('Fischer increment is added to the mover on their own board', () => {
    const { r } = table({ baseMin: 1, incSec: 2 });
    const t = start(r);
    play(r, 'A', 'e4', t + 5_000);
    const s = r.snapshot(t + 5_000);
    expect(s.clocks['A-w']).toBe(60_000 - 5_000 + 2_000);
  });
  it('low time threshold is min(20s, 10% of base)', () => {
    expect(new Room('a', deps, T0).lowTimeMs).toBe(20_000);
    const r = new Room('b', deps, T0);
    r.setup(r.join({ type: 'join' }, T0).team!, { type: 'setup', tc: { baseMin: 1, incSec: 0 } }, T0);
    expect(r.lowTimeMs).toBe(6_000);
  });
  it('nextDeadline includes the abort deadline while no action has been made', () => {
    const { r } = table({ baseMin: 30, incSec: 0 });
    const t = start(r);
    expect(r.nextDeadline()).toBe(t + ABORT_MS);
    play(r, 'A', 'e4', t + 1_000);
    expect(r.nextDeadline()).toBe(t + 30 * 60_000); // back to the earliest flag
  });
  it('nextDeadline tracks the earliest running flag', () => {
    const { r } = table({ baseMin: 1, incSec: 0 });
    const t = start(r);
    play(r, 'A', 'e4', t + 50_000);   // A-w down to 10s, A-b now running with 60s
    expect(r.nextDeadline()).toBe(t + 60_000); // B-w flags first: 60s from start
  });
});

describe('flags and the order of events (BRIEF §3.6.1)', () => {
  it('an action arriving after the deadline loses to the flag', () => {
    const { r } = table({ baseMin: 1, incSec: 0 });
    const t = start(r);
    play(r, 'B', 'e4', t + 5_000);        // B-b now runs with a full minute, so only A-w is near zero
    const out = play(r, 'A', 'e4', t + 61_000);
    expect(r.phase).toBe('over');
    expect(r.result!.reason).toBe('flag');
    expect(r.result!.winner).toBe('BA');  // A-w belongs to WA
    expect(r.result!.board).toBe('A');
    expect(r.ply.length).toBe(1);         // only the board B move was recorded
    expect(out.events.some(e => e.type === 'ended')).toBe(true);
  });
  it('a clock that reaches exactly zero flags', () => {
    const { r } = table({ baseMin: 1, incSec: 0 });
    const t = start(r);
    play(r, 'B', 'e4', t + 5_000);
    r.tick(t + 59_999);
    expect(r.phase).toBe('playing');
    r.tick(t + 60_000);              // A-w is exactly 0 here
    expect(r.phase).toBe('over');
    expect(r.result).toMatchObject({ reason: 'flag', winner: 'BA' });
  });
  it('an action arriving exactly at the deadline is accepted', () => {
    const { r } = table({ baseMin: 1, incSec: 0 });
    const t = start(r);
    play(r, 'A', 'e4', t + 59_999);
    expect(r.phase).toBe('playing');
    expect(r.ply.length).toBe(1);
  });
  it('lag credit is capped at 150 ms and at the time actually spent on the move', () => {
    const { r } = table({ baseMin: 1, incSec: 0 });
    const t = start(r);
    play(r, 'A', 'e4', t + 10_000, 1_000);          // rtt/2 = 500 -> capped to 150
    expect(r.snapshot(t + 10_000).clocks['A-w']).toBe(50_150);
    const t2 = t + 10_000;
    play(r, 'A', 'e5', t2 + 50, 1_000);             // only 50 ms elapsed on that move
    expect(r.snapshot(t2 + 50).clocks['A-b']).toBe(60_000 - 50 + 50);
  });
  it('lag credit can save an action that would otherwise have flagged', () => {
    const { r } = table({ baseMin: 1, incSec: 0 });
    const t = start(r);
    play(r, 'B', 'e4', t + 5_000);
    play(r, 'A', 'e4', t + 60_100, 400);  // 100 ms late, credit 200 -> accepted
    expect(r.phase).toBe('playing');
    expect(r.ply.length).toBe(2);
  });
  it('two flags on the same team lose; one on each team is a draw', () => {
    const same = table({ baseMin: 1, incSec: 0 });
    const t1 = start(same.r);
    // A-w and B-w both run from the start and both belong to... A-w is WA, B-w is BA.
    same.r.tick(t1 + 61_000);
    expect(same.r.result!.reason).toBe('draw-flags');   // one seat per team flags together
    expect(same.r.result!.winner).toBeNull();

    const one = table({ baseMin: 1, incSec: 0 });
    const t2 = start(one.r);
    play(one.r, 'B', 'e4', t2 + 1_000);                  // B-w (BA) stops; B-b (WA) starts
    one.r.tick(t2 + 61_000);                             // A-w (WA) and B-b (WA) flag together
    expect(one.r.result!.reason).toBe('flag');
    expect(one.r.result!.winner).toBe('BA');
  });
});

describe('end of game', () => {
  it('checkmate on either board ends the whole game', () => {
    const { r } = table();
    const t = start(r);
    // Fool's mate is not mate in bughouse: a dropped piece on g3 would block.
    play(r, 'A', 'f3', t + 1); play(r, 'A', 'e5', t + 2);
    play(r, 'A', 'g4', t + 3); play(r, 'A', 'Qh4', t + 4);
    expect(r.phase).toBe('playing');
    expect(r.snapshot(t + 4).status.A).toBe('pending');
    // A knight drop cannot be blocked, so it is mate.
    setBoard(r, 'B', '6rk/6pp/8/8/8/8/8/4K3[N] w - - 0 1');
    play(r, 'B', 'N@f7', t + 5);
    expect(r.phase).toBe('over');
    expect(r.result).toMatchObject({ reason: 'mate', board: 'B' });
    expect(r.result!.text).toContain('checkmate');
  });
  it('resignation ends the whole game, not one board', () => {
    const { r, host } = table();
    const t = start(r);
    r.resign(host, t + 1_000);
    expect(r.result).toMatchObject({ reason: 'resign', winner: host === 'WA' ? 'BA' : 'WA' });
  });
  it('aborts when neither player moves within 30 s of the start', () => {
    const { r } = table();
    const t = start(r);
    r.tick(t + ABORT_MS - 1);
    expect(r.phase).toBe('playing');
    r.tick(t + ABORT_MS);
    expect(r.result).toMatchObject({ reason: 'abort', winner: null });
  });
  it('does not abort once an action has been made', () => {
    const { r } = table();
    const t = start(r);
    play(r, 'A', 'e4', t + 1_000);
    r.tick(t + ABORT_MS + 5_000);
    expect(r.phase).toBe('playing');
  });
  it('clocks never report negative time after the game ends', () => {
    const { r } = table({ baseMin: 1, incSec: 0 });
    const t = start(r);
    r.tick(t + 120_000);
    for (const s of Object.values(r.snapshot(t + 120_000).clocks)) expect(s).toBeGreaterThanOrEqual(0);
  });
});

describe('draw offers', () => {
  it('offer, accept, and the game is drawn', () => {
    const { r, host, guest } = table();
    const t = start(r);
    expect(r.offerDraw(host, t).ok).toBe(true);
    expect(r.acceptDraw(guest, t + 1_000).ok).toBe(true);
    expect(r.result).toMatchObject({ reason: 'draw-agreed', winner: null });
  });
  it('an offer expires after 30 s and cannot then be accepted', () => {
    const { r, host, guest } = table();
    const t = start(r);
    play(r, 'A', 'e4', t + 100);     // keep the abort rule out of this test
    r.offerDraw(host, t);
    r.tick(t + DRAW_OFFER_MS - 1);
    expect(r.snapshot(t).drawOffer).not.toBeNull();
    r.tick(t + DRAW_OFFER_MS);
    expect(r.snapshot(t + DRAW_OFFER_MS).drawOffer).toBeNull();
    expect(r.phase).toBe('playing');
    expect(r.acceptDraw(guest, t + DRAW_OFFER_MS).ok).toBe(false);
  });
  it('after a decline the same player must wait 60 s to offer again', () => {
    const { r, host, guest } = table();
    const t = start(r);
    r.offerDraw(host, t);
    r.declineDraw(guest, t + 1_000);
    expect(r.offerDraw(host, t + 2_000).ok).toBe(false);
    expect(r.offerDraw(host, t + 1_000 + DRAW_REOFFER_BLOCK_MS).ok).toBe(true);
  });
  it('only one offer may be open, and you cannot accept your own', () => {
    const { r, host } = table();
    const t = start(r);
    r.offerDraw(host, t);
    expect(r.offerDraw(host, t).ok).toBe(false);
    expect(r.acceptDraw(host, t).ok).toBe(false);
  });
});

describe('presence, abandonment and rematch', () => {
  it('a seat is reclaimed with its token after a disconnect', () => {
    const { r, hostTok, host } = table();
    r.leave(host, T0 + 100);
    expect(r.snapshot(T0 + 100).players[host]!.connected).toBe(false);
    const back = r.join({ type: 'join', seatToken: hostTok }, T0 + 200);
    expect(back.team).toBe(host);
    expect(r.snapshot(T0 + 200).players[host]!.connected).toBe(true);
  });
  it('a win may be claimed only after 60 s of continuous disconnection', () => {
    const { r, host, guest } = table();
    const t = start(r);
    r.leave(guest, t);
    expect(r.claimWin(host, t + CLAIM_AFTER_MS - 1).ok).toBe(false);
    expect(r.snapshot(t + CLAIM_AFTER_MS).claimable[host]).toBe(true);
    expect(r.claimWin(host, t + CLAIM_AFTER_MS).ok).toBe(true);
    expect(r.result).toMatchObject({ reason: 'abandon', winner: host });
  });
  it('reconnecting before the claim keeps the game alive', () => {
    const { r, host, guest, guestTok } = table();
    const t = start(r);
    r.leave(guest, t);
    r.join({ type: 'join', seatToken: guestTok }, t + 30_000);
    expect(r.claimWin(host, t + CLAIM_AFTER_MS + 1_000).ok).toBe(false);
    expect(r.phase).toBe('playing');
  });
  it('both players gone for five minutes voids the game', () => {
    const { r, host, guest } = table({ baseMin: 30, incSec: 0 });
    const t = start(r);
    play(r, 'A', 'e4', t + 100);   // past the abort window, so the void rule is what applies
    r.leave(host, t); r.leave(guest, t + 1_000);
    r.tick(t + 1_000 + VOID_AFTER_MS);
    expect(r.result).toMatchObject({ reason: 'void', winner: null });
  });
  it('a rematch swaps teams, keeps the time control and starts a fresh game', () => {
    const { r, host, guest } = table({ baseMin: 3, incSec: 2 });
    const t = start(r);
    r.resign(host, t + 1_000);
    const hostName = r.snapshot(t).players[host]!.name;
    expect(r.requestRematch(host, t + 2_000).ok).toBe(true);
    expect(r.requestRematch(guest, t + 3_000).ok).toBe(true);
    expect(r.phase).toBe('countdown');
    expect(r.tc).toEqual({ baseMin: 3, incSec: 2 });
    expect(r.ply).toEqual([]);
    expect(r.result).toBeNull();
    expect(r.snapshot(t + 3_000).players[guest]!.name).toBe(hostName); // teams swapped
  });
  it('a rematch request expires after 60 s', () => {
    const { r, host } = table();
    const t = start(r);
    r.resign(host, t + 1_000);
    r.requestRematch(host, t + 2_000);
    r.tick(t + 2_000 + REMATCH_MS);
    expect(r.snapshot(t).rematch).toBeNull();
  });
});

describe('action validation', () => {
  it('rejects moves out of turn, on the wrong board, and malformed payloads', () => {
    const { r, host, guest } = table();
    const t = start(r);
    const wa: Team = 'WA', ba: Team = 'BA';
    const offTurn = r.act(ba, 'A', { type: 'action', board: 'A', action: { kind: 'move', from: S('e7'), to: S('e5') } }, t);
    expect(offTurn.ok).toBe(false);
    expect(offTurn.reason).toMatch(/not your turn/);
    expect(r.act(wa, 'A', { type: 'action', board: 'A', action: { kind: 'move', from: 99, to: 3 } } as never, t).ok).toBe(false);
    expect(r.act(wa, 'A', { type: 'action', board: 'A', action: { kind: 'drop', piece: 'k', to: 20 } } as never, t).ok).toBe(false);
    expect(r.act(wa, 'A', { type: 'action', board: 'A', action: { kind: 'move', from: S('e2'), to: S('e5') } }, t).ok).toBe(false);
    expect(r.ply.length).toBe(0);
    expect(r.phase).toBe('playing');
  });
  it('a rejected action costs no extra time', () => {
    const { r } = table();
    const t = start(r);
    r.act('WA', 'A', { type: 'action', board: 'A', action: { kind: 'move', from: S('e2'), to: S('e5') } }, t + 3_000);
    expect(r.snapshot(t + 3_000).clocks['A-w']).toBe(300_000 - 3_000);
  });
  it('actions are refused before the game starts and after it ends', () => {
    const { r, host } = table();
    expect(play(r, 'A', 'e4', T0)).toMatchObject({ ok: false });
    const t = start(r);
    r.resign(host, t);
    expect(play(r, 'A', 'e4', t + 1)).toMatchObject({ ok: false });
  });
});

describe('capture transfer across boards', () => {
  it('a capture on A appears in the partner reserve on B and can be dropped there', () => {
    const { r } = table();
    const t = start(r);
    play(r, 'A', 'e4', t + 1); play(r, 'A', 'd5', t + 2); play(r, 'A', 'exd5', t + 3);
    const snap = r.snapshot(t + 3);
    expect(snap.ply.at(-1)!.transfer).toEqual({ toBoard: 'B', color: 'b', piece: 'p' });
    expect(snap.fen.B).toContain('[p]');
    const drop = parseSan(r.game, 'B', 'P@e5');
    expect(drop).toBeNull();                       // white to move on B, not black
    play(r, 'B', 'e4', t + 4);
    expect(parseSan(r.game, 'B', 'P@e5')).not.toBeNull();
  });
});

describe('renaming in the lobby', () => {
  it('updates the seat name and is cleaned like any other name', () => {
    const { r, host } = table();
    expect(r.rename(host, '  Mara<script>  ', T0).ok).toBe(true);
    expect(r.snapshot(T0).players[host]!.name).toBe('Marascript');
  });
  it('is refused once the game is running', () => {
    const { r, host } = table();
    const t = start(r);
    expect(r.rename(host, 'Late', t).ok).toBe(false);
  });
});

describe('review findings', () => {
  it('a backwards system clock never charges the same time twice', () => {
    const { r } = table({ baseMin: 5, incSec: 0 });
    const t = start(r);
    r.tick(t + 10_000);
    expect(r.snapshot(t + 10_000).clocks['A-w']).toBe(290_000);
    r.tick(t + 9_000);                       // NTP steps the clock backwards
    expect(r.snapshot(t + 9_000).clocks['A-w']).toBe(290_000);  // nothing refunded
    r.tick(t + 11_000);                      // and nothing double-charged
    expect(r.snapshot(t + 11_000).clocks['A-w']).toBe(289_000);
  });

  it('a finished room is released once nobody is reading it, but not before', () => {
    const { r, host } = table();
    const t = start(r);
    play(r, 'A', 'e4', t + 100);
    r.resign(host, t + 1_000);
    expect(r.isExpired(t + 1_000)).toBe(false);
    expect(r.isExpired(t + 1_000 + FINISHED_ROOM_TTL_MS - 1)).toBe(false);
    expect(r.isExpired(t + 1_000 + FINISHED_ROOM_TTL_MS + 1)).toBe(true);
  });

  it('a rematch makes the room live again, so it is no longer collectable', () => {
    const { r, host, guest } = table();
    const t = start(r);
    r.resign(host, t + 1_000);
    r.requestRematch(host, t + 2_000);
    r.requestRematch(guest, t + 3_000);
    expect(r.isExpired(t + 3_000 + FINISHED_ROOM_TTL_MS + 1)).toBe(false);
  });

  it('a played-out table is never collected while the game is still running', () => {
    const { r } = table();
    const t = start(r);
    play(r, 'A', 'e4', t + 100);
    expect(r.isExpired(t + TABLE_EXPIRY_MS * 10)).toBe(false);
  });
});

describe('table names', () => {
  it('is stable for an id, and varied across ids', async () => {
    const { tableName, tableId } = await import('../src/ids.ts');
    expect(tableName('h27bqhex')).toBe(tableName('h27bqhex'));
    expect(tableName('h27bqhex')).toMatch(/^The [A-Z][a-z]+ [A-Z]/);
    // Use the same source production uses. An LCG's low bits are poor enough to
    // make this look like a hash collision problem when it is a random-source problem.
    const { randomFillSync } = await import('node:crypto');
    const names = new Set<string>();
    for (let i = 0; i < 400; i++) names.add(tableName(tableId(b => randomFillSync(b))));
    // Collisions are harmless (the URL identifies a table) but the pool should be wide.
    expect(names.size).toBeGreaterThan(300);
  });
});
