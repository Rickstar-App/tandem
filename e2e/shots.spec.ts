import { test } from '@playwright/test';
import { newTable, startGame, twoPlayers, typeMove } from './helpers';

/** Captures the real screens so the design can be reviewed as built, not as described. */
test('capture screens', async ({ browser }, info) => {
  const w = info.project.name;
  const p = await browser.newPage();
  await p.goto('/');
  await p.waitForTimeout(600);
  await p.screenshot({ path: `shots/${w}-home.png`, fullPage: true });
  await p.goto('/rules');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `shots/${w}-rules.png`, fullPage: true });
  const id = await newTable(p);
  await p.close();

  const { a, b, ctxA, ctxB } = await twoPlayers(browser, id);
  await a.waitForTimeout(400);
  await a.screenshot({ path: `shots/${w}-lobby.png`, fullPage: true });
  await startGame(a, b);

  const whiteA = (await a.locator('.topbar').innerText()).includes('White-A') ? a : b;
  const blackA = whiteA === a ? b : a;
  await typeMove(whiteA, 'a e4');
  await typeMove(blackA, 'a d5');
  await typeMove(whiteA, 'a exd5');
  await typeMove(blackA, 'b d4');
  await typeMove(whiteA, 'b Nf6');
  await a.waitForTimeout(700);
  await a.screenshot({ path: `shots/${w}-game.png`, fullPage: true });

  await a.getByRole('button', { name: 'Resign' }).click();
  await a.getByRole('button', { name: 'Confirm resign' }).click();
  await a.waitForTimeout(500);
  await a.screenshot({ path: `shots/${w}-result.png`, fullPage: true });
  await a.goto(`/g/${id}`);
  await a.waitForTimeout(800);
  await a.screenshot({ path: `shots/${w}-replay.png`, fullPage: true });
  await ctxA.close(); await ctxB.close();
});
