import { expect, test } from '@playwright/test';

async function openNetwork(page) {
  await page.goto('/');
  await page.locator('#page-network').scrollIntoViewIfNeeded();
  await expect(page.locator('.funding-network')).toBeVisible({ timeout: 20_000 });
}

test('loads the landing page and complete radial funding network', async ({ page }) => {
  await openNetwork(page);
  await expect(page.getByRole('heading', { name: /Where Ontario’s Health Dollars Went/ })).toBeAttached();
  await expect(page.locator('.landing__copy')).toContainText("Follow the money through Ontario's health system from the ministry to the recipient");
  await expect(page.locator('.landing__meta')).toContainText('Data for FY 2025–26');
  await expect(page.locator('.landing__meta')).toContainText('Created for Quantika by Ali Bukhari');
  await expect(page.getByRole('heading', { name: 'Who received Ontario’s health dollars?' })).toBeVisible();
  await expect(page.locator('[data-category-id]')).toHaveCount(14);
  await expect(page.locator('[data-program-key]')).toHaveCount(74);
  await expect(page.locator('[data-recipient-id]')).toHaveCount(2081);
  await expect(page.locator('.not-itemized-callout')).toContainText('$32.3B');
  await expect(page.locator('.network-legend')).toContainText('Ministry of Long-Term Care');
});

test('search reveals every route into a recipient and intermediary outflows', async ({ page }) => {
  await openNetwork(page);
  await page.locator('#recipient-search').fill('Ontario Health');
  await page.locator('[data-search-recipient]').filter({ hasText: /^Ontario Health/ }).first().click();
  await expect(page.locator('.network-tooltip')).toBeVisible();
  await expect(page.locator('.network-tooltip')).toContainText('Ontario Health');
  await expect(page.locator('#active-routes .active-route--intermediary')).toHaveCount(23);
  await expect(page.locator('.network-tooltip__outflows')).toContainText('Reported intermediary outflows');
  await expect(page).toHaveURL(/recipient=/);
});

test('search reaches a resolved provider and opens its financial profile', async ({ page }) => {
  await openNetwork(page);
  await page.locator('#recipient-search').fill('University Health Network');
  await page.locator('[data-search-recipient]').filter({ hasText: 'University Health Network' }).first().click();
  await expect(page.locator('.network-tooltip')).toContainText('University Health Network');
  await page.locator('[data-open-profile]').click();
  await expect(page.locator('#profile-panel')).toBeVisible();
  await expect(page.locator('#profile-content')).toContainText('University Health Network');
  await expect(page.locator('.statement-source a')).toHaveAttribute('href', /^https?:\/\//);
});

test('the page keeps horizontal overflow inside the network viewport', async ({ page }) => {
  await openNetwork(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('.network-table')).toBeAttached();
});
