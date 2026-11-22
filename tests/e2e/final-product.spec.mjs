import { expect, test } from '@playwright/test';

test('loads the complete editorial flow and its global ranking', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Where Ontario’s Health Dollars Went/ })).toBeVisible();
  await expect(page.locator('#source-control')).toBeHidden();
  await expect(page.locator('[data-category-id]')).toHaveCount(14);
  await expect(page.locator('#categories-content')).toContainText('$97.4B');

  await page.locator('#page-categories [data-tab="recipients"]').click();
  await expect(page.locator('.recipient-row').first()).toContainText('Ontario Health');
  await expect(page.locator('.recipient-row').first()).toContainText('intermediary');
  await expect(page.locator('.concentration-strip')).toContainText('22');
});

test('moves from a category to an official program and a recipient profile', async ({ page }) => {
  await page.goto('/?page=categories');
  await page.getByRole('button', { name: /Hospital care/ }).click();
  await expect(page.locator('#programs-content')).toContainText('Operation Of Hospitals');
  await expect(page.locator('.program-note')).toContainText('base, targeted, activity-based and one-time funding');

  await page.getByRole('button', { name: /Operation Of Hospitals/ }).click();
  await expect(page.locator('#recipients-content')).toContainText('Selected program');
  await expect(page).toHaveURL(/page=recipients.*category=hospital_care.*program=/);

  const uhn = page.locator('.recipient-row').filter({ hasText: 'University Health Network' }).first();
  await expect(uhn).toBeVisible();
  await uhn.click();
  await expect(page.locator('.payee-received-title')).toContainText('University Health Network');
  await expect(page.locator('.incoming-payment-route').first()).toBeVisible();
  await page.locator('.payee-junction').click();
  await expect(page.locator('#profile-content')).toContainText('University Health Network');
  await expect(page.locator('.statement-source a')).toHaveAttribute('href', /^https?:\/\//);
});

test('search reaches the global payee universe and structured alternatives exist', async ({ page }) => {
  await page.goto('/?page=recipients');
  await page.locator('#recipient-search').fill('City of Toronto');
  await expect(page.locator('.recipient-row')).toHaveCount(1);
  await expect(page.locator('.recipient-row')).toContainText('municipality or public health body');
  await expect(page.locator('#page-categories .structured-alternative')).toBeAttached();
  await expect(page.locator('#page-recipients .structured-alternative')).toBeAttached();
});

test('the responsive document does not create page-level horizontal overflow', async ({ page }) => {
  await page.goto('/?page=categories');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
