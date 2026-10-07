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
