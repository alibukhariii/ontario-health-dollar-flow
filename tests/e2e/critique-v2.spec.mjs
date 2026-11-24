import { expect, test } from '@playwright/test';

async function openReview(page) {
  await page.goto('/review-v2/');
  await page.locator('#explore').scrollIntoViewIfNeeded();
  await expect(page.locator('.flow-globe')).toBeAttached({ timeout: 20_000 });
}

test('review edition explains scope and opens with a complete recipient answer', async ({ page }) => {
  await openReview(page);
  await expect(page.getByRole('heading', { name: /Where Ontario's Health Dollars Went/ })).toBeAttached();
  await expect(page.locator('.scope')).toContainText('$97.434B');
  await expect(page.locator('.scope')).toContainText('-$421.011M');
  await expect(page.locator('.scope')).toContainText('$92.286B');
  await expect(page.locator('.scope-note')).toContainText('not added to it');
  await expect(page.locator('.flow-globe [data-recipient-id]')).toHaveCount(25);
  await expect(page.locator('.recipient-dust')).toHaveCount(140);
  await expect(page.locator('#answer-card')).toContainText('Tillsonburg District Memorial Hospital');
  await expect(page.locator('#answer-card')).toContainText('rank 166 of 2,081');
});
test('concentration and purpose groups keep named tail and non-itemized money distinct', async ({ page }) => {
  await openReview(page);
  await expect(page.locator('.concentration-segment')).toHaveCount(4);
  await expect(page.locator('#concentration-chart')).toContainText('Other 2,056 named recipients');
  await expect(page.locator('#concentration-chart')).toContainText('Not itemized to a named recipient');
  await expect(page.locator('.purpose-row')).toHaveCount(6);
  await expect(page.locator('.purpose-row').first()).toContainText('payment lines');
  await page.locator('.purpose-row--grouped summary').click();
  await expect(page.locator('.purpose-row--grouped section')).toHaveCount(9);
});

test('search turns Ontario Health into an answer and keeps outflows outside the payment total', async ({ page }) => {
  await openReview(page);
  await page.locator('#recipient-search').fill('Ontario Health');
  await page.locator('[data-search-id]').filter({ hasText: /^Ontario Health/ }).first().click();
  await expect(page.locator('#answer-card')).toContainText('Ontario Health');
  await expect(page.locator('#answer-card')).toContainText('Money passed onward');
  await expect(page.locator('#answer-card')).toContainText('not added to the $97.4B published-payment total');
  await expect(page).toHaveURL(/#r=/);
});

test('comparison pins a second recipient with its own purpose split', async ({ page }) => {
  await openReview(page);
  await page.locator('#answer-card [data-compare-recipient]').click();
  await page.locator('#recipient-search').fill('University Health Network');
  await page.locator('[data-search-id]').filter({ hasText: 'University Health Network' }).first().click();
  await expect(page.locator('#comparison-card')).toBeVisible();
  await expect(page.locator('#comparison-card')).toContainText('University Health Network');
  await expect(page).toHaveURL(/compare=/);
});

test('phone view swaps the globe for tap-friendly purpose accordions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await openReview(page);
  await expect(page.locator('.flow-globe')).toBeHidden();
  await expect(page.locator('#flat-view')).toBeVisible();
  await page.locator('.flat-category summary').first().click();
  await expect(page.locator('.flat-program').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('review edition remains useful without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/review-v2/');
  await expect(page.getByRole('heading', { name: 'Open the method and download the crosswalk' })).toBeVisible();
  await expect(page.locator('.static-purpose')).toHaveCount(14);
  await expect(page.locator('.static-purpose').first()).toContainText('Operation Of Hospitals');
  await context.close();
});
