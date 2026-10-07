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
