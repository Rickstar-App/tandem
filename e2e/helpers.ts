import { expect, type Browser, type Page } from '@playwright/test';

/** Create a table and return its id, using the same endpoint the client uses. */
export async function newTable(page: Page): Promise<string> {
  const res = await page.request.post('/api/table');
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json() as { id: string };
  return id;
}

/** Two independent browser contexts, so each player has their own storage and seat token. */
export async function twoPlayers(browser: Browser, id: string, names: [string, string] = ['Ada', 'Bo']) {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto(`/t/${id}`);
  await a.getByLabel('Your name').fill(names[0]);
  await expect(a.getByRole('heading', { name: `Table ${id}` })).toBeVisible();
  await b.goto(`/t/${id}`);
  await b.getByLabel('Your name').fill(names[1]);
  await expect(b.getByRole('heading', { name: `Table ${id}` })).toBeVisible();
  return { a, b, ctxA, ctxB };
}

/** Press Ready on both and wait for play to start. */
export async function startGame(a: Page, b: Page) {
  await a.getByRole('button', { name: 'Ready', exact: true }).click();
  await b.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(a.getByText(/Starting in/)).toBeVisible();
  await expect(a.locator('.status')).toBeVisible();
  await expect(b.locator('.status')).toBeVisible();
}

/** Play a move through the command line, which exercises the same path as clicking. */
export async function typeMove(page: Page, text: string) {
  // On narrow screens the line is collapsed to leave the boards more height.
  const opener = page.getByRole('button', { name: 'Type a move' });
  if (await opener.count()) await opener.click();
  const input = page.getByLabel(/Move command/);
  await input.fill(text);
  await input.press('Enter');
}

/** The page whose turn it is on a board, by reading the status line. */
export async function waitForStatus(page: Page, board: 'A' | 'B', re: RegExp) {
  await expect(page.locator('.status p', { hasText: `Board ${board}:` })).toHaveText(re);
}
