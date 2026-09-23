import { test, expect } from '../src/fixtures';
import { expectNoRawJson } from '../src/product-flows';
import { SITE } from '../src/site';

/**
 * Journey 8 — Site config / share.
 *
 * `GET /api/v1/site/config` is the one read behind every "the shop's own …"
 * on the storefront (`api/api.js` `siteConfig()`). `src/seed.ts`
 * writes a name, a login logo and a copyright image that differ from every
 * bundled default (`src/site.ts`), so a page that ignored the config would
 * show CRMEB's own instead, and the journey would say so.
 *
 * The share panel does not depend on site config — it reads the product —
 * and is asserted on its own.
 */

test('the public site config route answers, cached and versioned', async ({ shopperApi }) => {
  const response = await shopperApi.get('/api/v1/site/config');
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    name: string;
    version: string;
    payments: { wechat: boolean };
  };
  expect(body.name).toBe(SITE.siteName);
  expect(typeof body.version).toBe('string');

  // Cheap to poll, by its own doc comment: a second call within the 60s
  // Redis cache window answers the same version without visibly failing.
  const second = await shopperApi.get('/api/v1/site/config');
  expect(second.ok()).toBe(true);
  const secondBody = (await second.json()) as { version: string };
  expect(secondBody.version).toBe(body.version);
});

test("a product's share panel opens with a poster action, independent of site config", async ({
  shopperPage,
  shop,
}) => {
  // The share panel is reachable from the product page itself, before it is
  // ever added to the cart — no need to actually buy anything for this. With
  // no published product page this is the built-in default:
  // its bottom bar carries the 分享 entry.
  await shopperPage.goto(`/pages/goods_details/index?id=${shop.fixtures.postageProductId}`);
  await expect(shopperPage.getByText('E2E 运费商品').first()).toBeVisible();
  await expectNoRawJson(shopperPage);
  await shopperPage.getByText('分享', { exact: true }).click();
  await expect(shopperPage.getByText('生成海报', { exact: true })).toBeVisible({ timeout: 10_000 });
});

test("the storefront shows the shop's own logo and copyright, not the bundled defaults", async ({
  page,
  shopperPage,
}) => {
  // The login page's logo is `logo.login` (`getLogo(2)`).
  await page.goto('/pages/users/login/index');
  await expect(page.locator(`img[src="${SITE.loginLogo}"]`)).toBeAttached({ timeout: 15_000 });

  // The 个人中心 footer's image is `copyright.imageUrl`, replacing the
  // bundled `static/images/support.png`.
  await shopperPage.goto('/pages/user/index');
  // `<image>` renders as `<uni-image>` around a real `<img>`.
  await expect(shopperPage.getByTestId('site-copyright').locator('img')).toHaveAttribute(
    'src',
    SITE.copyrightImage,
    { timeout: 15_000 },
  );
});
