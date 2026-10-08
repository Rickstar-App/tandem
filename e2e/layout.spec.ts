import { expect, test } from '@playwright/test';
import { newTable, startGame, twoPlayers, typeMove } from './helpers';

/**
 * The responsive contract (BRIEF §5.3): the board you play on never falls below 34 px squares,
 * both boards stay visible with their clocks and reserves, and nothing is cut off sideways.
 */
test('the played board keeps usable squares and both boards stay visible', async ({ browser }, info) => {
  const p = await browser.newPage();
  const id = await newTable(p);
  await p.close();
  const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
  await startGame(a, b);
  await a.waitForTimeout(700);

  const grids = a.locator('.grid');
  await expect(grids).toHaveCount(2);
  const widths = await grids.evaluateAll(els => els.map(e => e.getBoundingClientRect().width));
  const focusMode = (await a.locator('.wrap').getAttribute('data-focus')) === 'true';

  // The board being played is always comfortably usable.
  expect(Math.max(...widths) / 8).toBeGreaterThanOrEqual(34);
  // In focus mode the second board is a glance view; otherwise both are full size.
  if (!focusMode) expect(Math.min(...widths) / 8).toBeGreaterThanOrEqual(34);

  // Four clocks and four reserves are on screen in every layout.
  await expect(a.locator('.clock')).toHaveCount(4);
  await expect(a.locator('.reserve')).toHaveCount(4);

  // No horizontal overflow at any width.
  const overflow = await a.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The whole playing surface sits above the fold, scrolled to the top.
  const surfaceBottom = await a.locator('.status').evaluate(e => e.getBoundingClientRect().bottom + window.scrollY);
  const vh = await a.evaluate(() => window.innerHeight);
  expect(surfaceBottom).toBeLessThanOrEqual(vh);

  await ctxA.close(); await ctxB.close();
});

test('layout does not change when the page is scrolled', async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone', 'only the phone layout is height-constrained');
  const p = await browser.newPage();
  const id = await newTable(p);
  await p.close();
  const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
  await startGame(a, b);
  await a.waitForTimeout(700);
  const before = await a.locator('.grid').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
  await typeMove(a, 'a e4');          // focusing the input scrolls the page
  await a.evaluate(() => window.scrollTo(0, 400));
  await a.waitForTimeout(500);
  const after = await a.locator('.grid').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
  expect(after).toEqual(before);
  await ctxA.close(); await ctxB.close();
});

/**
 * BRIEF §5.3 names 360 x 640 as the case where two stacked boards cannot both reach the
 * 34 px floor. The played board must still clear it, and the other must stay on screen
 * with its clocks and reserve rather than being hidden.
 */
test('a small phone falls back to focus mode with a usable played board', async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone', 'runs once, at its own size');
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const page = await ctx.newPage();
  const id = await newTable(page);
  await page.close();

  const a = await ctx.newPage();
  const ctxB = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const b = await ctxB.newPage();
  for (const [p, name] of [[a, 'Ada'], [b, 'Bo']] as const) {
    await p.goto(`/t/${id}`);
    await p.getByLabel('Your name').fill(name);
    await expect(p.getByRole('heading', { name: `Table ${id}` })).toBeVisible();
  }
  await startGame(a, b);
  await a.waitForTimeout(700);

  await expect(a.locator('.wrap')).toHaveAttribute('data-focus', 'true');
  const widths = await a.locator('.grid').evaluateAll(els => els.map(e => e.getBoundingClientRect().width));
  expect(Math.max(...widths) / 8, 'the board being played must stay usable').toBeGreaterThanOrEqual(34);
  // Nothing is hidden: both boards, four clocks and four reserves are still rendered.
  await expect(a.locator('.grid')).toHaveCount(2);
  await expect(a.locator('.clock')).toHaveCount(4);
  await expect(a.locator('.reserve')).toHaveCount(4);
  // Tapping the mini board swaps which one is large.
  const before = await a.locator('.grid').first().evaluate(e => e.getBoundingClientRect().width);
  await a.getByRole('button', { name: /Play board . at full size/ }).click();
  await a.waitForTimeout(400);
  const after = await a.locator('.grid').first().evaluate(e => e.getBoundingClientRect().width);
  expect(after).not.toBe(before);

  expect(await a.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close(); await ctxB.close();
});
