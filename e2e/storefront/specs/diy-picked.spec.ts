import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '../src/fixtures';

/**
 * A DIY 商品列表 set to 指定商品 shows the products the operator picked —
 * those and no others, in the order they were picked.
 *
 * The page is saved the way the editor saves it (`goodsList.list` rows), so
 * the whole chain is exercised: the save stores only the ids
 * (`goodsList.ids`), `goodList.vue` reads them back, the api layer sends them
 * as `ids`, and `GET /api/v1/catalog/products` answers in that order. The
 * third seeded product is on the shelf too, so a list that ignored the picks
 * would show it.
 *
 * The component itself is the one from the production home page fixture, with
 * only its picks replaced, so everything else it renders is real stored data.
 */

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'contracts',
  'src',
  'diy',
  '__fixtures__',
);

function productListNode(): Record<string, unknown> {
  const row = JSON.parse(readFileSync(path.join(FIXTURES, 'prod-6.json'), 'utf8')) as {
    value: unknown;
  };
  const page = (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) as Record<
    string,
    Record<string, unknown>
  >;
  const node = Object.values(page).find((entry) => entry.name === 'goodList');
  if (!node) throw new Error('prod-6.json has no 商品列表 to reuse');
  return structuredClone(node);
}

test('a 商品列表 on 指定商品 shows exactly the picked products, in the order picked', async ({
  shopperPage,
  adminApi,
  shop,
}) => {
  const key = '1790000000000001';
  const node = productListNode();
  Object.assign(node, {
    timestamp: Number(key),
    id: `id${key}`,
    isHide: false,
    typeConfig: { ...(node.typeConfig as object), activeValue: 1 },
    goodsList: {
      max: 20,
      list: [{ id: shop.fixtures.postageProductId }, { id: shop.fixtures.multiSpecProductId }],
    },
  });

  const created = await adminApi.post('/admin-api/diy/pages', {
    data: { name: 'E2E 指定商品', kind: 'micro' },
  });
  expect(created.status(), await created.text()).toBe(201);
  const pageId = ((await created.json()) as { id: string }).id;
  const saved = await adminApi.put(`/admin-api/diy/pages/${pageId}/content`, {
    data: { content: { [key]: node }, publish: true },
  });
  expect(saved.status(), await saved.text()).toBe(200);

  await shopperPage.goto(`/pages/annex/special/index?theme_id=${pageId}`);
  const block = shopperPage.getByTestId(`diy-id${key}`);
  await expect(block).toContainText('E2E 运费商品', { timeout: 20_000 });
  await expect(block).toContainText('E2E 多规格商品');

  const text = await block.innerText();
  expect(text.indexOf('E2E 运费商品')).toBeLessThan(text.indexOf('E2E 多规格商品'));
  expect(text).not.toContain('E2E 活动商品');
});
