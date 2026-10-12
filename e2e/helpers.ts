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
  await expect(a.locator('.lobby h1')).toBeVisible();
  await b.goto(`/t/${id}`);
  await b.getByLabel('Your name').fill(names[1]);
  await expect(b.locator('.lobby h1')).toBeVisible();
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

/**
 * Play a move through the command line, which exercises the same path as clicking.
 *
 * Waits for the server to confirm the move before returning. That matters as soon as the round
 * trip is real: the command line parses against the position the player can actually see, so a
 * reply typed before the previous move has arrived parses in the wrong position and is correctly
 * refused rather than queued. Against localhost the ~1ms round trip always won that race and hid
 * it; against a deployment three quick moves became one. The move list head carries the ply count
 * even while collapsed, which is the cheapest confirmation signal and is board-agnostic.
 *
 * The count can rise by more than one from a single move, because a queued premove goes out in the
 * same breath, so this polls for an increase rather than asserting an exact value.
 */
export async function typeMove(page: Page, text: string) {
  // On narrow screens the line is collapsed to leave the boards more height.
  const opener = page.getByRole('button', { name: 'Type a move' });
  if (await opener.count()) await opener.click();
  const plies = page.locator('.movelist .head .muted');
  const before = Number((await plies.innerText()).trim());
  const input = page.getByLabel(/Move command/);
  await input.fill(text);
  await input.press('Enter');
  // An explicit budget: expect.poll does not inherit the configured expect timeout, and over a
  // real network a confirmation can take noticeably longer than it does against localhost.
  await expect
    .poll(async () => Number((await plies.innerText()).trim()), {
      timeout: 20_000,
      message: `the server never confirmed "${text}" (ply count stayed at ${before})`,
    })
    .toBeGreaterThan(before);
}

/** The page whose turn it is on a board, by reading the status line. */
export async function waitForStatus(page: Page, board: 'A' | 'B', re: RegExp) {
  await expect(page.locator('.status p', { hasText: `Board ${board}:` })).toHaveText(re);
}
