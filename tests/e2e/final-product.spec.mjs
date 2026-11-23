import { expect, test } from '@playwright/test';

async function openNetwork(page) {
  await page.goto('/');
  await page.locator('#page-network').scrollIntoViewIfNeeded();
  await expect(page.locator('.funding-network')).toBeAttached({ timeout: 20_000 });
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
  await expect(page.locator('.funding-network [data-recipient-id]')).toHaveCount(50);
  await expect(page.locator('.recipient-node--smaller')).toHaveAttribute('aria-label', /smaller recipients/);
  await expect(page.locator('.recipient-node--not-itemized')).toHaveCount(0);
  await expect(page.locator('.recipient-coverage-note')).toContainText('$32.3B');
  await expect(page.locator('.recipient-coverage-note')).toContainText('Source note');
  await expect(page.locator('.coverage-split__itemized')).toContainText('$65.2B');
  await expect(page.locator('.coverage-split__aggregate')).toContainText('$32.3B');
  await expect(page.locator('.network-intro')).toContainText('$65.2B went to 2,081 named recipients');
  await expect(page.locator('.network-net-note')).toContainText('$97.0B net');
  await expect(page.locator('.network-legend')).toContainText('Ministry of Long-Term Care');
});

test('category and recipient aggregates open legible zoom levels', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile');
  await openNetwork(page);
  await page.locator('[data-category-id="hospital_care"]').click();
  await expect(page.locator('.program-focus-status')).toContainText('Hospital care');
  await expect(page.locator('.program-node__index')).toHaveCount(4);
  await page.locator('[data-program-focus-back]').click();

  await page.locator('[data-category-id="ministry_operations_and_other_published_payments"]').click();
  await expect(page.locator('.program-focus-list__item')).toHaveCount(16);
  await expect(page.locator('.program-focus-list')).toContainText('Other Payments');
  await page.locator('[data-program-focus-back]').click();

  await page.locator('[data-recipient-zoom-offset="50"]').click();
  await expect(page.locator('.recipient-zoom-status')).toContainText('Ranks 51–100');
  await expect(page.locator('.funding-network [data-recipient-id]')).toHaveCount(50);
  await expect(page.locator('[data-recipient-zoom-back="0"]')).toBeVisible();
});

test('search reveals every route into a recipient and intermediary outflows', async ({ page }, testInfo) => {
  await openNetwork(page);
  await page.locator('#recipient-search').fill('Ontario Health');
  await page.locator('[data-search-recipient]').filter({ hasText: /^Ontario Health/ }).first().click();
  await expect(page.locator('.network-tooltip')).toBeVisible();
  await expect(page.locator('.network-tooltip')).toContainText('Ontario Health');
  if (testInfo.project.name === 'mobile') {
    await expect(page.locator('.network-tooltip__more')).toContainText('+ 15 more published routes');
  } else {
    await expect(page.locator('#active-routes .active-route--intermediary')).toHaveCount(23);
  }
  await expect(page.locator('.network-tooltip__outflows')).toContainText('Reported intermediary outflows');
  await expect(page).toHaveURL(/\/recipient\/[^/]+\/$/);
  await expect(page.locator('[data-close-tooltip]')).toBeVisible();
  await page.locator('[data-close-tooltip]').click();
  await expect(page.locator('.network-tooltip')).toBeHidden();
});

test('mobile uses an expandable list instead of a horizontally scrolling radial canvas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await openNetwork(page);
  await expect(page.locator('.mobile-network')).toBeVisible();
  await expect(page.locator('.funding-network')).toBeHidden();
  await page.locator('.mobile-category').first().locator('summary').click();
  await expect(page.locator('.mobile-program').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
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

test('recipient deep links contain useful HTML when JavaScript is disabled', async ({ browser, request, baseURL }) => {
  const pointer = await (await request.get('/data/current.json')).json();
  const network = await (await request.get(`/${pointer.flow_v2.network_path}`)).json();
  const recipient = network.recipients.find((row) => row.label === 'Ontario Health');
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto(`/recipient/${recipient.recipient_id}/`);
  await expect(page.getByRole('heading', { name: 'Ontario Health' })).toBeVisible();
  await expect(page.locator('.static-recipient')).toContainText('$12.0B');
  await expect(page.locator('.static-recipient')).toContainText('Home Care');
  await expect(page.getByText('Loading the published payment network…')).toHaveCount(0);
  await context.close();
});
