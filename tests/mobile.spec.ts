import { expect, test } from '@playwright/test';
import { addChannel, registerViaApi } from './helpers';

// Runs only in the mobile-chromium project (390×844 viewport).
test('mobile: dashboard and compose have no horizontal scrollbar', async ({ page }) => {
  await registerViaApi(page, 'mobile');
  await addChannel(page);

  for (const path of ['/dashboard', '/compose']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(fits, `${path} overflows a 390px viewport (scrollWidth > innerWidth)`).toBeTruthy();
  }
});
