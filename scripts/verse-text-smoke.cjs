const { chromium } = require('playwright');

(async () => {
  const targetUrl = process.env.TARGET_URL || 'https://theological-topography.vercel.app';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Search doctrine, verse, or topic').fill('adoption');
    await page.locator('section:has-text("Document Matches") button').first().click();

    const rootsSection = page.locator('section').filter({ hasText: 'Scripture Roots' }).first();
    const showBtn = rootsSection.getByRole('button', { name: 'Show Verse Text' }).first();
    await showBtn.click();

    // Deterministic checks: expand state and panel visibility regardless of network response timing.
    const hideBtn = rootsSection.getByRole('button', { name: 'Hide Verse Text' }).first();
    await hideBtn.waitFor({ state: 'visible', timeout: 10000 });

    await hideBtn.click();

    const hiddenState = await rootsSection.getByRole('button', { name: 'Show Verse Text' }).first().isVisible();
    if (!hiddenState) {
      throw new Error('Expected verse text panel to collapse after hide toggle.');
    }

    console.log(`VERSE_TEXT_SMOKE: PASS (${targetUrl})`);
  } catch (error) {
    console.error('VERSE_TEXT_SMOKE: FAIL');
    throw error;
  } finally {
    await browser.close();
  }
})();
