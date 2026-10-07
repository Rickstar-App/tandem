import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { newTable, startGame, twoPlayers } from './helpers';

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page }).withTags(RULES).analyze();
}
const report = (r: Awaited<ReturnType<typeof scan>>) =>
  r.violations.map(v => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}\n    ${v.nodes[0]?.html?.slice(0, 160)}`).join('\n');

test('home, rules and not-found pass an axe audit', async ({ page }) => {
  for (const path of ['/', '/rules', '/nope']) {
    await page.goto(path);
    await page.waitForTimeout(400);
    const r = await scan(page);
    expect(report(r), `${path}`).toBe('');
  }
});

test('the lobby and a live game pass an axe audit', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one audit pass is enough for the game screen');
  const p = await browser.newPage();
  const id = await newTable(p);
  await p.close();
  const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
  await a.waitForTimeout(400);
  expect(report(await scan(a)), 'lobby').toBe('');
  await startGame(a, b);
  await a.waitForTimeout(600);
  expect(report(await scan(a)), 'game').toBe('');
  await ctxA.close(); await ctxB.close();
});

test('a game can be played with the keyboard alone', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop');
  const p = await browser.newPage();
  const id = await newTable(p);
  await p.close();
  const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
  await startGame(a, b);

  const whiteA = (await a.locator('.topbar').innerText()).includes('White-A') ? a : b;
  // "/" opens the move line from anywhere, with no pointer involved.
  await whiteA.locator('body').press('/');
  await expect(whiteA.getByLabel(/Move command/)).toBeFocused();
  await whiteA.keyboard.type('a e4');
  await whiteA.keyboard.press('Enter');
  await expect(a.locator('.status p').first()).toHaveText(/Black to move/);

  // The board itself is reachable and drivable by key.
  const boardA = whiteA.locator('section[aria-label="Board A"] .grid');
  await boardA.focus();
  await expect(boardA).toBeFocused();
  await ctxA.close(); await ctxB.close();
});

test('the live region announces moves', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop');
  const p = await browser.newPage();
  const id = await newTable(p);
  await p.close();
  const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
  await startGame(a, b);
  const whiteA = (await a.locator('.topbar').innerText()).includes('White-A') ? a : b;
  const other = whiteA === a ? b : a;
  await whiteA.getByRole('button', { name: 'Type a move' }).count()
    .then(async n => { if (n) await whiteA.getByRole('button', { name: 'Type a move' }).click(); });
  const input = whiteA.getByLabel(/Move command/);
  await input.fill('a e4');
  await input.press('Enter');
  await expect(other.locator('[role="status"][aria-live="polite"]')).toHaveText(/Board A, White e4/);
  await ctxA.close(); await ctxB.close();
});
