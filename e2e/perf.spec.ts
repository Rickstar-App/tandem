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
