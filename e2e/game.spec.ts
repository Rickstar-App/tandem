import { expect, test } from '@playwright/test';
import { newTable, startGame, twoPlayers, typeMove, waitForStatus } from './helpers';

test.describe('a full game', () => {
  test('two players join, play on both boards, transfer a capture and finish', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'one full pass is enough; layout is covered separately');
    const page = await browser.newPage();
    const id = await newTable(page);
    await page.close();

    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);

    // Both seats are shown before the game starts.
    await expect(a.getByText('Ada')).toBeVisible();
    await expect(a.getByText('Bo')).toBeVisible();

    await startGame(a, b);

    // White-A moves first on board A; the other player holds White on B.
    const whiteA = (await a.locator('.topbar').innerText()).includes('White-A') ? a : b;
    const blackA = whiteA === a ? b : a;

    await typeMove(whiteA, 'a e4');
    await waitForStatus(a, 'A', /Black to move/);

    await typeMove(blackA, 'a d5');
    await waitForStatus(a, 'A', /White to move/);

    // A capture on A feeds the partner reserve on B.
    await typeMove(whiteA, 'a exd5');
    await expect(a.locator('.status')).toContainText('Board B');
    // The pawn is now in Black-A's reserve on board B: that player can drop it.
    await typeMove(blackA, 'b d4');
    await waitForStatus(a, 'B', /Black to move/);

    // Moves are listed for both players, merged and numbered.
    await a.getByRole('button', { name: /Show moves/ }).click();
    await expect(a.locator('.rows li')).toHaveCount(4);
    await expect(a.locator('.rows')).toContainText('exd5');

    // Resigning ends the whole game and offers the replay.
    await a.getByRole('button', { name: 'Resign' }).click();
    await a.getByRole('button', { name: 'Confirm resign' }).click();
    await expect(a.locator('.result')).toContainText(/wins/);
    await expect(b.locator('.result')).toContainText(/wins/);
    await expect(a.getByRole('link', { name: 'Replay' })).toBeVisible();

    await ctxA.close(); await ctxB.close();
  });

  test('a premove plays the instant the turn arrives', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop');
    const p = await browser.newPage();
    const id = await newTable(p); await p.close();
    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
    await startGame(a, b);

    const whiteA = (await a.locator('.topbar').innerText()).includes('White-A') ? a : b;
    const blackA = whiteA === a ? b : a;

    // Black queues a reply on board A before White has moved.
    const boardA = blackA.locator('section[aria-label="Board A"] .grid');
    await boardA.locator('[aria-label^="e7"]').click();
    await boardA.locator('[aria-label^="e5"]').click();
    await expect(blackA.locator('section[aria-label="Board A"] .pre')).toHaveCount(2);

    await typeMove(whiteA, 'a e4');
    // The queued move goes out on its own.
    await waitForStatus(a, 'A', /White to move/);
    await a.getByRole('button', { name: /Show moves/ }).click();
    await expect(a.locator('.rows')).toContainText('e5');

    await ctxA.close(); await ctxB.close();
  });

  test('a seat survives a reload', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop');
    const p = await browser.newPage();
    const id = await newTable(p); await p.close();
    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
    await startGame(a, b);
    const before = await a.locator('.topbar').innerText();
    await a.reload();
    await expect(a.locator('.status')).toBeVisible();
    expect(await a.locator('.topbar').innerText()).toBe(before);
    await ctxA.close(); await ctxB.close();
  });

  test('a third visitor watches and cannot act', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop');
    const p = await browser.newPage();
    const id = await newTable(p); await p.close();
    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
    await startGame(a, b);

    const ctxC = await browser.newContext();
    const c = await ctxC.newPage();
    await c.goto(`/watch/${id}`);
    await expect(c.locator('.status')).toBeVisible();
    await expect(c.getByLabel(/Move command/)).toHaveCount(0);
    await expect(c.getByRole('button', { name: 'Resign' })).toHaveCount(0);
    await expect(a.getByText(/1 watching/)).toBeVisible();
    await ctxA.close(); await ctxB.close(); await ctxC.close();
  });
});

test.describe('cancelling a held piece', () => {
  test.beforeEach(({ }, info) => { test.skip(info.project.name !== 'desktop'); });

  test('a reserve piece is put back by clicking anything that is not a legal square', async ({ browser }) => {
    const p = await browser.newPage();
    const id = await newTable(p);
    await p.close();
    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
    await startGame(a, b);

    const whiteA = (await a.locator('.topbar').innerText()).includes('White-A') ? a : b;
    const blackA = whiteA === a ? b : a;
    // Give White-A a pawn in its board-B reserve by capturing on A.
    await typeMove(whiteA, 'a e4');
    await typeMove(blackA, 'a d5');
    await typeMove(whiteA, 'a exd5');

    const boardB = whiteA.locator('section[aria-label="Board B"]');
    const slot = boardB.locator('.reserve.mine .slot').first();
    await expect(slot).toBeVisible();

    const pickUp = async () => {
      await slot.click();
      await expect(slot).toHaveAttribute('aria-pressed', 'true');
    };
    const isHeld = () => slot.getAttribute('aria-pressed');

    // 1. Clicking an occupied square that is not a legal drop puts it back.
    await pickUp();
    await boardB.locator('.grid [aria-label^="e7"]').click();
    expect(await isHeld()).toBe('false');

    // 2. Clicking outside the board entirely puts it back.
    await pickUp();
    await whiteA.locator('.status').click();
    expect(await isHeld()).toBe('false');

    // 3. Clicking the other board puts it back.
    await pickUp();
    await whiteA.locator('section[aria-label="Board A"] .grid [aria-label^="a1"]').click();
    expect(await isHeld()).toBe('false');

    // 4. A legal square still drops it. Board B is Black-A's move until it plays,
    //    and a drop made out of turn is queued as a premove rather than executed,
    //    so hand the move over first.
    await typeMove(blackA, 'b e4');
    await waitForStatus(whiteA, 'B', /Black to move/);
    const slots = whiteA.locator('section[aria-label="Board B"] .reserve.mine .slot');
    const n = await slots.count();
    await pickUp();
    await boardB.locator('.grid [aria-label^="e5"]').click();
    await expect(slots).toHaveCount(n - 1);

    await ctxA.close(); await ctxB.close();
  });

  test('a selected board piece is deselected by clicking an empty square', async ({ browser }) => {
    const p = await browser.newPage();
    const id = await newTable(p);
    await p.close();
    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
    await startGame(a, b);
    const whiteA = (await a.locator('.topbar').innerText()).includes('White-A') ? a : b;

    const gridA = whiteA.locator('section[aria-label="Board A"] .grid');
    await gridA.locator('[aria-label^="e2"]').click();
    await expect(gridA.locator('.sel')).toHaveCount(1);
    await gridA.locator('[aria-label^="h5"]').click();     // empty, not a legal target
    await expect(gridA.locator('.sel')).toHaveCount(0);

    await ctxA.close(); await ctxB.close();
  });
});
