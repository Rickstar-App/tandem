import { expect, test } from '@playwright/test';

/** BRIEF §9.4: initial-route JavaScript ≤ 150 kB gzipped, LCP under 1.5 s. */
test('the first screen is small and paints quickly', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'measured on the mobile profile');

  const js: { url: string; bytes: number }[] = [];
  page.on('response', async (res) => {
    const ct = res.headers()['content-type'] ?? '';
    if (!/javascript/.test(ct)) return;
    const enc = res.headers()['content-encoding'] ?? 'none';
    try {
      const body = await res.body();
      js.push({ url: new URL(res.url()).pathname, bytes: enc === 'none' ? body.length : body.length });
    } catch { /* response body already discarded */ }
  });

  // Throttle to a mid-range 4G connection, or the number is just a measure of localhost.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,                       // ms round trip
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto('/', { waitUntil: 'load' });
  const lcp = await page.evaluate(() => new Promise<number>((resolve) => {
    let last = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) last = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => resolve(last), 2500);
  }));

  // Gzip the served bundle the way a real host would, and measure that.
  const { gzipSync } = await import('node:zlib');
  let gzipped = 0;
  for (const f of js) {
    const res = await page.request.get(f.url);
    gzipped += gzipSync(await res.body()).length;
  }
  console.log(`[perf] js files=${js.length} gzipped=${(gzipped / 1024).toFixed(1)}kB LCP=${Math.round(lcp)}ms (4G, 4x CPU throttle)`);
  expect(gzipped).toBeLessThanOrEqual(150 * 1024);
  expect(lcp).toBeLessThan(1500);
});

/**
 * A preload that names a file the page never uses costs every visitor a download for nothing.
 * It happened once: importing the font CSS through the bundler made a second, hashed copy of
 * every face, so the preload pointed at a file the stylesheet never asked for.
 *
 * Checking that the preloaded file was *requested* proves nothing, because a preload always
 * issues its own request. The real invariant is that some @font-face rule the page actually
 * loaded names that exact URL.
 */
test('every preloaded font is one a loaded @font-face actually names', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one check is enough');

  const warnings: string[] = [];
  page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });

  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const { preloaded, declared } = await page.evaluate(() => {
    const abs = (u: string, base: string) => new URL(u, base).pathname;
    const preloaded = [...document.querySelectorAll('link[rel="preload"][as="font"]')]
      .map(l => abs((l as HTMLLinkElement).href, location.href));
    const declared: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }   // cross-origin sheet
      // A url() inside CSS resolves against the stylesheet, not the document.
      const base = sheet.href ?? location.href;
      for (const rule of [...rules]) {
        if (rule.constructor.name !== 'CSSFontFaceRule') continue;
        const src = (rule as CSSFontFaceRule).style.getPropertyValue('src');
        for (const m of src.matchAll(/url\(["']?([^"')]+)["']?\)/g)) declared.push(abs(m[1]!, base));
      }
    }
    return { preloaded, declared };
  });

  expect(preloaded.length, 'the clock face should be preloaded (BRIEF §7.4)').toBeGreaterThan(0);
  expect(declared.length, 'no @font-face rules were readable').toBeGreaterThan(0);
  for (const p of preloaded) {
    expect(declared, `preloaded ${p}, but no loaded @font-face names it`).toContain(p);
  }

  // The browser emits its own complaint a few seconds after load; give it time to arrive.
  await page.waitForTimeout(3500);
  expect(warnings.filter(w => /preload/i.test(w)), 'browser flagged an unused preload').toEqual([]);
});
