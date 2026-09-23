import type { Page } from '@playwright/test';

import { blockedBy } from '../src/blocked';
import { test, expect } from '../src/fixtures';
import { unexplainedConsoleErrors, unexplainedFailures } from '../src/known-gaps';

/**
 * Journey 1 — Home → category → product.
 *
 * The one journey that is purely about *rendering*: the DIY home page from a
 * real production fixture, the category list (whichever of the three
 * `goods_cate1/2/3` layouts `getThemeInfo('category')` picks — the assertion
 * below is deliberately text-only, not markup-specific, because the layout
 * itself is a decision this stream does not own), and a product detail page
 * for both a multi-spec product and a fixed-postage one.
 *
 * "Renders every fixture component" is checked by id, not by eye: the DIY
 * renderer (`PageDesign`) gives each component's wrapper the component's own
 * id from the saved page, and `src/seed.ts` records, for every production
 * fixture it seeds, which ids a correct render must contain
 * (`renderedComponentIds`). A component that silently fails to render is a
 * missing id, not a slightly different screenshot.
 */

/** The ids of `expected` that are not in the page's DOM. */
async function missingComponents(page: Page, expected: readonly string[]): Promise<string[]> {
  return page.evaluate(
    (ids) => ids.filter((id) => document.getElementById(id) === null),
    [...expected],
  );
}

test('the DIY home page renders every fixture component with no console error', async ({
  shopperPage,
  consoleErrors,
  failedRequests,
  shop,
}) => {
  // `shopperPage`'s own fixture already did `goto('/')`, after both health
  // listeners were attached — so what they hold is the first load's.
  await expect(shopperPage).toHaveURL(/\/pages\/index\/index|\/$/);
  await shopperPage.waitForLoadState('networkidle');
  // The fixture's home page is real content, not an empty shell: the DIY
  // renderer's product blocks list the seeded products by name.
  await expect(shopperPage.getByText('E2E', { exact: false }).first()).toBeVisible();
  const home = shop.fixtures.diyPages.find((page) => page.kind === 'home')!;
  expect(home.componentIds.length).toBeGreaterThan(0);
  await expect
    .poll(() => missingComponents(shopperPage, home.componentIds), {
      message: `components of ${home.fixture} missing from the home page`,
    })
    .toEqual([]);
  expect(
    unexplainedConsoleErrors(consoleErrors),
    `console errors on home (not in src/known-gaps.ts):\n${consoleErrors.join('\n')}`,
  ).toEqual([]);
  expect(
    unexplainedFailures(failedRequests),
    `failed requests on home (not in src/known-gaps.ts):\n${failedRequests.join('\n')}`,
  ).toEqual([]);
});

test('the category tab shows the seeded category', async ({ shopperPage }) => {
  await shopperPage.goto('/pages/goods_cate/goods_cate');
  // Whichever of the three layouts is configured, the category name is
  // rendered as plain text somewhere in the tree.
  await expect(shopperPage.getByText('E2E 类目').first()).toBeVisible({ timeout: 20_000 });
});

// The micro pages (微页面) are the other production fixtures: each is its own
// DIY page, opened by id through `pages/annex/special`. One test per fixture,
// so a report names the fixture that failed. The names are listed here, not
// read from the stack file, because Playwright collects tests before
// `webServer` has seeded anything; `src/seed.ts` seeds exactly these two.
for (const fixture of ['prod-7.json', 'prod-8.json']) {
  test(`the micro page from ${fixture} renders its own components, not the home page's`, async ({
    shopperPage,
    shop,
  }) => {
    blockedBy(
      'CR-4-i §6: getThemeInfo answers the home page for every theme_id, so a micro page renders the home page',
    );
    const micro = shop.fixtures.diyPages.find((page) => page.fixture === fixture);
    expect(micro, `${fixture} was not seeded as a micro page`).toBeTruthy();
    expect(micro!.kind).toBe('micro');
    await shopperPage.goto(`/pages/annex/special/index?theme_id=${micro!.id}`);
    await expect
      .poll(() => missingComponents(shopperPage, micro!.componentIds), {
        message: `components of ${fixture} missing from its micro page`,
      })
      .toEqual([]);
  });
}

test('a multi-spec product shows its price range and both spec groups', async ({
  shopperPage,
  shop,
}) => {
  blockedBy('CR-2-h3: the product page is a DIY product_detail page no storefront route serves');
  await shopperPage.goto(`/pages/goods_details/index?id=${shop.fixtures.multiSpecProductId}`);
  await expect(shopperPage.getByText('E2E 多规格商品').first()).toBeVisible();

  // Opens the attribute popup (the first of the two taps `goCat()` needs);
  // this journey only has to prove the picker is reachable and lists both
  // spec groups, not complete a purchase — journey 2 owns "buy it".
  await shopperPage.getByText('加入购物车', { exact: true }).click();
  await expect(shopperPage.getByText('颜色', { exact: true })).toBeVisible();
  await expect(shopperPage.getByText('尺码', { exact: true })).toBeVisible();
  await expect(shopperPage.getByText('白', { exact: true })).toBeVisible();
  await expect(shopperPage.getByText('黑', { exact: true })).toBeVisible();
  await expect(shopperPage.getByText('M', { exact: true })).toBeVisible();
  await expect(shopperPage.getByText('L', { exact: true })).toBeVisible();
});

test("a fixed-postage product shows its own name and price, not the freight product's", async ({
  shopperPage,
  shop,
}) => {
  blockedBy('CR-2-h3: the product page is a DIY product_detail page no storefront route serves');
  await shopperPage.goto(`/pages/goods_details/index?id=${shop.fixtures.postageProductId}`);
  await expect(shopperPage.getByText('E2E 运费商品').first()).toBeVisible();
  // ¥39.00 is this SKU's seeded price (`src/seed.ts`); freight itself is
  // only quoted once an address is known, at checkout — journey 2's freight
  // assertion, not this one's.
  await expect(shopperPage.getByText('39.00', { exact: false }).first()).toBeVisible();
});
