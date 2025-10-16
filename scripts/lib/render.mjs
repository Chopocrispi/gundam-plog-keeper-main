// Lightweight Playwright renderer helper. Dynamically imports Playwright so
// the main script doesn't fail when Playwright isn't installed.
export async function renderHtml(url, timeoutMs = 15000) {
  try {
    const mod = await import('playwright');
    const { chromium } = mod;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
      const html = await page.content();
      return html;
    } finally {
      try { await page.close(); } catch {}
      try { await context.close(); } catch {}
      try { await browser.close(); } catch {}
    }
  } catch (e) {
    // Re-throw to allow caller to fallback
    throw e;
  }
}
