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
  await expect(page.locator('#page-overview')).toContainText('Together, the Ministry of Health and Ministry of Long-Term Care spent $97.4B* in 2025–26.');
  await expect(page.locator('#page-overview')).toContainText('$65.2B went to 2,081 named recipients.');
  await expect(page.locator('#page-overview')).toContainText('$32.3B (33.1%) was not itemized.');
  await expect(page.locator('.overview-chart__title')).toContainText('A quarter (25.3%) went to these 10 named recipients.');
  await expect(page.locator('[data-overview-recipient]')).toHaveCount(10);
  await expect(page.locator('.overview-chart__axis-title')).toHaveText('Amount (billions)');
  await expect(page.locator('#page-overview')).toContainText('$97.0B net after a −$421.0M');
  await expect(page.locator('#page-overview .network-source')).toBeVisible();
  await expect(page.locator('#page-network .network-source')).toHaveCount(0);
  await expect(page.locator('[data-category-id]')).toHaveCount(14);
  await expect(page.locator('[data-program-key]')).toHaveCount(74);
  await expect(page.locator('.funding-network [data-recipient-id]')).toHaveCount(50);
  await expect(page.locator('.recipient-node--smaller')).toHaveAttribute('aria-label', /smaller recipients/);
  await expect(page.locator('.recipient-node--not-itemized')).toHaveCount(0);
  await expect(page.locator('.recipient-coverage-note')).toContainText('$32.3B');
  await expect(page.locator('.recipient-coverage-note')).not.toContainText('Source note');
  await expect(page.locator('.coverage-split__itemized')).toHaveCount(0);
  await expect(page.locator('.coverage-split__aggregate')).toHaveCount(0);
  await expect(page.locator('.size-key')).toHaveCount(0);
  await expect(page.locator('.network-scale')).toBeVisible();
  await expect(page.locator('.funding-network .orbit')).toHaveCount(0);
  await expect(page.locator('.funding-network .orbit-label')).toHaveCount(0);
  await expect(page.locator('.network-legend')).toContainText('Ministry of Long-Term Care');
});

test('overview concentration bars open the selected recipient on the network page', async ({ page }) => {
  await page.goto('/');
  await page.locator('#page-overview').scrollIntoViewIfNeeded();
  const firstRecipient = page.locator('[data-overview-recipient]').first();
  await expect(firstRecipient).toContainText('Ontario Health');
  await firstRecipient.click();
  await expect(page.locator('#page-network')).toBeInViewport();
  await expect(page.locator('.network-tooltip')).toBeVisible();
  await expect(page.locator('.network-tooltip')).toContainText('Ontario Health');
  await expect(page).toHaveURL(/\/recipient\/[^/]+\/$/);
});

test('category and recipient aggregates open legible zoom levels', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile');
  await openNetwork(page);
  await page.locator('[data-category-id="hospital_care"]').click();
  await expect(page.locator('.program-focus-status')).toContainText('Hospital care');
  await expect(page.locator('.program-node__index')).toHaveCount(4);
  await expect(page.locator('.program-node.is-context')).toHaveCount(70);
  await expect(page.locator('.scale-step--programs')).toHaveAttribute('aria-current', 'step');
  await page.locator('[data-program-key]').filter({ has: page.locator('.program-node__index') }).first().click();
  await expect(page.locator('.scale-step--recipients')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.program-node.is-selected')).toHaveCount(1);
  await expect(page.locator('.recipient-node.is-scale-active')).not.toHaveCount(0);
  await page.locator('[data-program-focus-back]').click();
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
  await expect(page.locator('.overview-chart__name').first()).toHaveCSS('white-space', 'normal');
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
  await expect(page.getByRole('heading', { name: 'Ontario Health', exact: true })).toBeVisible();
  await expect(page.locator('.static-recipient')).toContainText('$12.0B');
  await expect(page.locator('.static-recipient')).toContainText('Home Care');
  await expect(page.getByText('Loading the published payment network…')).toHaveCount(0);
  await context.close();
});
