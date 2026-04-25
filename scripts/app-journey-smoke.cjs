const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'https://theological-topography.vercel.app';

async function expectVisible(locator, label) {
  const visible = await locator.first().isVisible().catch(() => false);
  if (!visible) {
    throw new Error(`Expected visible: ${label}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('[1] Open app');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

    console.log('[2] Check onboarding labels');
    await expectVisible(page.getByText('What This App Does'), 'What This App Does');
    await expectVisible(page.getByText('Top Connected Doctrines'), 'Top Connected Doctrines');

    console.log('[3] Perform doctrine search and open first result');
    const input = page.getByPlaceholder('Search doctrine, verse, or topic');
    await input.fill('adoption');
    await page.waitForTimeout(300);
    const firstMatch = page.locator('section:has-text("Document Matches") button').first();
    await firstMatch.click();

    console.log('[4] Validate lineage and evidence sections');
    await expectVisible(page.getByText('Root Document'), 'Root Document card');
    await expectVisible(page.getByText('Cross-Reference Engine'), 'Cross-Reference Engine');
    await expectVisible(page.getByText('Why These Are Linked'), 'Why These Are Linked');

    console.log('[5] Validate compare and share actions');
    const compareButton = page.locator('button:has-text("COPY_STUDY_LINK"), button:has-text("COPIED")').first();
    await expectVisible(compareButton, 'Copy study link action');

    console.log('[6] Validate historical type controls');
    await expectVisible(page.getByText('Historical Type'), 'Historical Type controls');

    console.log('PASS app journey smoke test');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error('FAIL app journey smoke test');
  console.error(error);
  process.exit(1);
});
