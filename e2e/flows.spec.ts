import { expect, test } from '@playwright/test';
import { newTable, startGame, twoPlayers, typeMove } from './helpers';

test.describe('product flows', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'flows are width-independent');
  });

  test('the home page carries its settings into the new table', async ({ page, context }) => {
    await page.goto('/');
    await page.getByLabel('Your name').fill('Ada');
    await page.getByRole('button', { name: '3+2' }).click();
    await page.getByRole('button', { name: 'Black-A' }).click();
    await page.getByRole('button', { name: 'Create table' }).click();
    await expect(page).toHaveURL(/\/t\/[0-9a-z]{8}$/);
    // The chosen control and team are applied to the table, not silently dropped.
    await expect(page.locator('.topbar')).toContainText('3+2');
    await expect(page.getByRole('button', { name: 'Black-A' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.seat.you h2')).toHaveText('Black-A');
    await expect(page.locator('.seat.you')).toContainText('Ada');
  });

  test('a draw can be offered, declined, then agreed', async ({ browser }) => {
    const p = await browser.newPage();
    const id = await newTable(p);
    await p.close();
    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
    await startGame(a, b);

    await a.getByRole('button', { name: 'Offer draw' }).click();
    await a.getByRole('button', { name: 'Confirm draw offer' }).click();
    await expect(b.locator('.offer')).toContainText('offers a draw');
    await b.getByRole('button', { name: 'Decline' }).click();
    await expect(b.locator('.offer')).toHaveCount(0);

    // The same player is blocked from offering again straight away.
    await a.getByRole('button', { name: 'Offer draw' }).click();
    await a.getByRole('button', { name: 'Confirm draw offer' }).click();
    await expect(a.locator('.banner.err')).toContainText(/wait \d+s/);

    // The other player may offer, and it can be accepted.
    await b.getByRole('button', { name: 'Offer draw' }).click();
    await b.getByRole('button', { name: 'Confirm draw offer' }).click();
    await a.getByRole('button', { name: 'Accept' }).click();
    await expect(a.locator('.result')).toContainText('Draw by agreement');
    await expect(b.locator('.result')).toContainText('Draw by agreement');
    await ctxA.close(); await ctxB.close();
  });

  test('a rematch swaps teams and starts a new game', async ({ browser }) => {
    const p = await browser.newPage();
    const id = await newTable(p);
    await p.close();
    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
    await startGame(a, b);
    const teamBefore = (await a.locator('.topbar').innerText()).includes('White-A') ? 'White-A' : 'Black-A';

    await a.getByRole('button', { name: 'Resign' }).click();
    await a.getByRole('button', { name: 'Confirm resign' }).click();
    await expect(a.locator('.result')).toBeVisible();

    await a.getByRole('button', { name: 'Rematch' }).click();
    await expect(b.locator('.result')).toContainText('wants another game');
    await b.getByRole('button', { name: 'Accept rematch' }).click();

    await expect(a.locator('.result')).toHaveCount(0);
    await expect(a.locator('.status')).toBeVisible();
    const teamAfter = (await a.locator('.topbar').innerText()).includes('White-A') ? 'White-A' : 'Black-A';
    expect(teamAfter).not.toBe(teamBefore);
    await ctxA.close(); await ctxB.close();
  });

  test('a finished game is replayable move by move', async ({ browser }) => {
    const p = await browser.newPage();
    const id = await newTable(p);
    await p.close();
    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
    await startGame(a, b);
    const whiteA = (await a.locator('.topbar').innerText()).includes('White-A') ? a : b;
    const blackA = whiteA === a ? b : a;
    await typeMove(whiteA, 'a e4');
    await typeMove(blackA, 'a d5');
    await typeMove(whiteA, 'a exd5');
    await a.getByRole('button', { name: 'Resign' }).click();
    await a.getByRole('button', { name: 'Confirm resign' }).click();
    await expect(a.locator('.result')).toBeVisible();

    await a.goto(`/g/${id}`);
    await expect(a.locator('.headline')).toContainText(/wins/);
    await expect(a.locator('.rows li')).toHaveCount(3);
    // The scrubber walks the game and the move list follows.
    await expect(a.locator('.rows li.now')).toContainText('exd5');
    await a.getByRole('button', { name: 'Start' }).click();
    await expect(a.locator('.rows li.now')).toHaveCount(0);
    await a.getByRole('button', { name: 'Next move' }).click();
    await expect(a.locator('.rows li.now')).toContainText('e4');
    // Exports are reachable and real.
    const txt = await a.request.get(`/api/game/${id}.txt`);
    expect(txt.ok()).toBeTruthy();
    expect(await txt.text()).toContain('A.w e4');
    await ctxA.close(); await ctxB.close();
  });

  test('an unknown table id shows a plain not-found page', async ({ page }) => {
    await page.goto('/t/iiiiiiii');   // 'i' is not in the table-id alphabet
    await expect(page.getByRole('heading', { name: 'No such page' })).toBeVisible();
  });

  test('a disconnected opponent can be claimed against', async ({ browser }) => {
    const p = await browser.newPage();
    const id = await newTable(p);
    await p.close();
    const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
    await startGame(a, b);
    await typeMove(a, (await a.locator('.topbar').innerText()).includes('White-A') ? 'a e4' : 'b e4');
    // No claim button while the opponent is present.
    await expect(a.getByRole('button', { name: 'Claim win' })).toHaveCount(0);
    await ctxB.close();
    await expect(a.locator('.strip', { hasText: 'away' }).first()).toBeVisible();
    await ctxA.close();
  });
});

test('a name typed before the connection settles is kept', async ({ browser }) => {
  test.skip(test.info().project.name !== 'desktop');
  const p = await browser.newPage();
  const id = await newTable(p);
  await p.close();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/t/${id}`);
  await page.getByLabel('Your name').fill('Mara');
  await page.waitForTimeout(1200);          // long enough for joined + rename to settle
  await expect(page.getByLabel('Your name')).toHaveValue('Mara');
  await expect(page.locator('.seat.you')).toContainText('Mara');
  await ctx.close();
});

test('a spectator can flip the board orientation', async ({ browser }) => {
  test.skip(test.info().project.name !== 'desktop');
  const p = await browser.newPage();
  const id = await newTable(p);
  await p.close();
  const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
  await startGame(a, b);

  const ctxC = await browser.newContext();
  const c = await ctxC.newPage();
  await c.goto(`/watch/${id}`);
  await expect(c.locator('.status')).toBeVisible();

  // Default is White-A's view: White sits at the bottom of board A.
  const bottomOfA = () => c.locator('section[aria-label="Board A"] .strip').last().innerText();
  expect(await bottomOfA()).toContain('White');
  await c.getByRole('button', { name: /Flip to Black-A/ }).click();
  expect(await bottomOfA()).toContain('Black');

  await ctxA.close(); await ctxB.close(); await ctxC.close();
});

test('number keys move focus between the boards', async ({ browser }) => {
  test.skip(test.info().project.name !== 'desktop');
  const p = await browser.newPage();
  const id = await newTable(p);
  await p.close();
  const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
  await startGame(a, b);
  await a.locator('body').press('2');
  await expect(a.locator('section[aria-label="Board B"] .grid')).toBeFocused();
  await a.locator('body').press('1');
  await expect(a.locator('section[aria-label="Board A"] .grid')).toBeFocused();
  await ctxA.close(); await ctxB.close();
});

/**
 * QA-002: the custom time-control fields were seeded once and then drifted. Picking a preset
 * left them showing the old numbers, so pressing Set silently reverted the table to whatever
 * they still held. A control that undoes your last choice is worse than no control.
 */
test('the custom time control always shows what the table is actually set to', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  const id = await newTable(page);
  await page.goto(`/t/${id}`);
  await expect(page.locator('.lobby h1')).toBeVisible();

  await page.getByRole('button', { name: '3+2', exact: true }).click();
  await expect(page.locator('.topbar')).toContainText('3+2');
  await expect(page.getByLabel('Minutes', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Increment seconds')).toHaveValue('2');

  await page.getByRole('button', { name: '10+0', exact: true }).click();
  await expect(page.locator('.topbar')).toContainText('10+0');
  await expect(page.getByLabel('Minutes', { exact: true })).toHaveValue('10');

  // Pressing Set without touching the fields must leave the table exactly as it was.
  await page.getByRole('button', { name: 'Set' }).click();
  await expect(page.locator('.topbar')).toContainText('10+0');

  // And a real custom value still applies.
  await page.getByLabel('Minutes', { exact: true }).fill('7');
  await page.getByLabel('Increment seconds').fill('3');
  await page.getByRole('button', { name: 'Set' }).click();
  await expect(page.locator('.topbar')).toContainText('7+3');
});

test('a table is named rather than numbered, and the name is stable', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  const id = await newTable(page);
  await page.goto(`/t/${id}`);
  const name = (await page.locator('.lobby h1').innerText()).trim();

  // Readable, not the raw id.
  expect(name).toMatch(/^The [A-Z]/);
  expect(name).not.toContain(id);
  // The topbar and the page title agree with it.
  await expect(page.locator('.topbar')).toContainText(name);
  expect(await page.title()).toContain(name);
  // The id still identifies the table, so the invite link is unchanged.
  await expect(page.getByLabel('Send this link to your opponent')).toHaveValue(new RegExp(`/t/${id}$`));

  // The same table reads the same way after a reload.
  await page.reload();
  await expect(page.locator('.lobby h1')).toHaveText(name);
});
