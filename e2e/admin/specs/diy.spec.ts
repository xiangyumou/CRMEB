import { test, expect, cjk, dialog, toast } from '../src/fixtures';

/**
 * 装修 → 保存 → 发布 → the storefront reads the same JSON back.
 *
 * The DIY page content is the one payload in the system that the admin writes
 * as an opaque document and the storefront renders verbatim. Every other
 * surface has a contract in the middle that would catch a disagreement; here
 * the *only* thing that catches it is reading it back.
 */

// A fixed name, not `Date.now()`: Playwright restarts the worker process
// after a failing test, which re-evaluates this module, and the second test
// would then look for a page the first one never created.
const NAME = 'E2E 微页面';

test('edit, save, publish, and the storefront gets what was published', async ({
  adminPage,
  request,
}) => {
  await adminPage.goto('/admin/diy');
  await adminPage.getByRole('button', { name: '新建页面' }).click();

  const modal = dialog(adminPage);
  await modal.getByLabel('页面名称').fill(NAME);
  await modal.getByRole('button', { name: cjk('保存') }).click();
  await expect(toast(adminPage, '已创建')).toBeVisible();

  const row = adminPage.getByRole('row').filter({ hasText: NAME }).first();
  await row.getByRole('button', { name: cjk('装修') }).click();
  await expect(adminPage).toHaveURL(/\/admin\/diy\/\d+$/);
  const pageId = adminPage.url().split('/').pop()!;

  // An empty page says so; adding a component has to change that.
  await expect(adminPage.getByText('从左侧选择组件添加到页面')).toBeVisible();
  // Not `exact`: the palette tile carries an antd icon, so its accessible
  // name is `font-size 文本标题`.
  await adminPage.getByRole('button', { name: '文本标题' }).click();
  await expect(adminPage.getByText('从左侧选择组件添加到页面')).toHaveCount(0);
  await expect(adminPage.getByText('未保存')).toBeVisible();

  // 保存, not 保存并发布 — a draft save must NOT reach the storefront. This is
  // the assertion that a "publish" button is a real gate and not decoration.
  await adminPage.getByRole('button', { name: cjk('保存') }).click();
  // The editor shows no toast — its mutations opt out of the global one so a
  // version conflict can have a dialog instead (`editor.tsx:157`). The 未保存
  // tag going away is what tells the operator the draft is on the server, so
  // that is what this asserts.
  await expect(adminPage.getByText('未保存')).toHaveCount(0);

  const beforePublish = await request.get(`/api/v1/diy/pages/${pageId}`);
  expect(beforePublish.status(), 'an unpublished page must not be readable by a shopper').toBe(404);

  await adminPage.getByRole('button', { name: '保存并发布' }).click();
  await expect(adminPage.getByText('已发布')).toBeVisible();

  const published = await request.get(`/api/v1/diy/pages/${pageId}`);
  expect(published.status(), await published.text()).toBe(200);
  const body = await published.json();
  // `content` is the renderer's own envelope, stored byte for byte: a map of
  // stamp → component node (the prod-6 shape), not a `components` array. The
  // component that was just added is the only entry.
  expect(Object.keys(body.content as Record<string, unknown>)).toHaveLength(1);

  // The published document is the one the editor holds. Compare the admin's
  // own read of it with the storefront's, field for field, rather than
  // trusting that both were derived from the same row.
  const adminRead = await adminPage.request.get(`/admin-api/diy/pages/${pageId}`);
  expect(adminRead.status()).toBe(200);
  const adminBody = await adminRead.json();
  expect(body.content, 'the storefront must read back exactly what the editor saved').toEqual(
    adminBody.content,
  );
  expect(body.version).toBe(adminBody.version);
});

test('publishing needs the publish atom, not just the edit one', async ({ adminPage }) => {
  // The super admin holds both, so this asserts the buttons are distinct
  // rather than the permission itself — `restricted-role.spec.ts` owns that.
  await adminPage.goto('/admin/diy');
  const row = adminPage.getByRole('row').filter({ hasText: NAME }).first();
  await row.getByRole('button', { name: cjk('装修') }).click();
  await expect(adminPage.getByRole('button', { name: cjk('保存') })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: '保存并发布' })).toBeVisible();
});

test('the pickers offer the shop’s own article and coupon, and the page stores their ids', async ({
  adminPage,
  adminApi,
}) => {
  // What a picker offers is saved into the page and rendered by the
  // storefront, so it has to be a record the shop really has: a published
  // article, and a coupon a shopper can claim right now.
  const stamp = Date.now();
  const articleTitle = `E2E 装修文章 ${stamp}`;
  const couponName = `E2E 装修券 ${stamp}`;

  const article = await adminApi.post('/admin-api/cms/articles', {
    data: { title: articleTitle, status: 'published' },
  });
  expect(article.status(), await article.text()).toBe(201);
  const articleId = ((await article.json()) as { id: string }).id;

  const coupon = await adminApi.post('/admin-api/coupons', {
    data: {
      name: couponName,
      scope: 'all_products',
      claimMode: 'manual',
      status: 'active',
      discountAmount: '8.00',
      validityMode: 'days_after_claim',
      validDays: 7,
      isUnlimitedSupply: true,
    },
  });
  expect(coupon.status(), await coupon.text()).toBe(201);
  const couponId = ((await coupon.json()) as { id: string }).id;

  const page = await adminApi.post('/admin-api/diy/pages', {
    data: { name: `E2E 选择器 ${stamp}`, kind: 'micro' },
  });
  expect(page.status(), await page.text()).toBe(201);
  const pageId = ((await page.json()) as { id: string }).id;

  // 超级组件 is not in the palette (its inner layout needs a designer the
  // editor does not have), but a stored one stays fully editable. Seed one
  // bound to 文章, picking its rows by hand (数据选择 = 指定数据).
  const specific = {
    title: '数据选择',
    tabVal: 0,
    tabList: [{ name: '指定数据' }, { name: '筛选数据' }],
  };
  const seeded = await adminApi.put(`/admin-api/diy/pages/${pageId}/content`, {
    data: {
      content: {
        '1740450007006001': {
          cname: '超级组件',
          name: 'customComponent',
          timestamp: 1740450007006001,
          id: 'id1740450007006001',
          isHide: false,
          setUp: { tabVal: 0 },
          selectType: {
            title: '选择信息',
            activeValue: 'article',
            list: [
              { activeValue: 'user', title: '用户' },
              { activeValue: 'article', title: '文章' },
              { activeValue: 'coupon', title: '优惠券' },
              { activeValue: 'goods', title: '商品' },
            ],
          },
          articleDataSource: specific,
          articleList: { list: [] },
          couponDataSource: specific,
          couponList: { list: [] },
        },
      },
    },
  });
  expect(seeded.status(), await seeded.text()).toBe(200);

  // The only component on the page, so its panel is the one open.
  await adminPage.goto(`/admin/diy/${pageId}`);
  await expect(adminPage.getByText('选择信息')).toBeVisible();

  const pickType = async (label: string): Promise<void> => {
    await adminPage.getByRole('combobox').click();
    await adminPage.locator(`.ant-select-item-option[title="${label}"]`).click();
  };
  const pick = async (kind: string, name: string): Promise<void> => {
    await adminPage.getByRole('button', { name: cjk('添加') }).click();
    const modal = adminPage.getByRole('dialog', { name: `选择${kind}` });
    await modal.getByPlaceholder(`搜索${kind}名称`).fill(name);
    await modal.getByPlaceholder(`搜索${kind}名称`).press('Enter');
    const row = modal.getByRole('listitem').filter({ hasText: name });
    await row.getByRole('button', { name: cjk('选择') }).click();
    await expect(row.getByRole('button', { name: cjk('已选') })).toBeDisabled();
    await expect(modal.getByText(/示例/)).toHaveCount(0);
    await adminPage.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  };

  await pick('文章', articleTitle);
  await pickType('优惠券');
  await pick('优惠券', couponName);

  await adminPage.getByRole('button', { name: cjk('保存') }).click();
  await expect(adminPage.getByText('未保存')).toHaveCount(0);

  const saved = await adminApi.get(`/admin-api/diy/pages/${pageId}`);
  expect(saved.status()).toBe(200);
  const content = ((await saved.json()) as { content: Record<string, Record<string, unknown>> })
    .content;
  const node = Object.values(content).find((entry) => entry.name === 'customComponent');
  expect(node, JSON.stringify(content)).toBeDefined();
  // The ids the storefront sends back to its own API: the article id and the
  // coupon template id.
  expect(node!.articleList).toEqual({
    list: [expect.objectContaining({ id: articleId, name: articleTitle })],
  });
  expect(node!.couponList).toEqual({
    list: [expect.objectContaining({ id: couponId, name: couponName })],
  });
});

test('a saved 商品列表 shows its picks after a reload, and adding one keeps them', async ({
  adminPage,
  adminApi,
  shop,
}) => {
  // The server keeps a 商品列表's picks as `goodsList.ids` and drops the rows,
  // so the editor opens a saved page without them. What it shows then, and
  // what the next save writes, is the whole point of this test.
  const stamp = Date.now();
  const product = async (name: string): Promise<string> => {
    const created = await adminApi.post('/admin-api/catalog/products', {
      data: {
        name,
        kind: 'physical',
        status: 'on_shelf',
        imageUrl: 'https://cdn.example.com/p/1.png',
        sliderImages: [],
        specMode: false,
        specs: [],
        skus: [{ specValues: {}, price: '59.00', stock: 12, isDefault: true }],
        freightMode: 'free',
        purchaseLimitMode: 'none',
        descriptionHtml: '',
        categoryIds: [String(shop.fixtures.categoryId)],
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    return ((await created.json()) as { id: string }).id;
  };
  const firstName = `E2E 装修商品甲 ${stamp}`;
  const secondName = `E2E 装修商品乙 ${stamp}`;
  const first = await product(firstName);
  const second = await product(secondName);

  const page = await adminApi.post('/admin-api/diy/pages', {
    data: { name: `E2E 商品列表 ${stamp}`, kind: 'micro' },
  });
  expect(page.status(), await page.text()).toBe(201);
  const pageId = ((await page.json()) as { id: string }).id;

  const storedGoods = async (): Promise<Record<string, unknown>> => {
    const read = await adminApi.get(`/admin-api/diy/pages/${pageId}`);
    expect(read.status()).toBe(200);
    const content = ((await read.json()) as { content: Record<string, Record<string, unknown>> })
      .content;
    const node = Object.values(content).find((entry) => entry.name === 'goodList');
    expect(node, JSON.stringify(content)).toBeDefined();
    return node!.goodsList as Record<string, unknown>;
  };
  const pick = async (name: string): Promise<void> => {
    await adminPage.getByRole('button', { name: cjk('添加') }).click();
    const modal = adminPage.getByRole('dialog', { name: '选择商品' });
    await modal.getByPlaceholder('搜索商品名称').fill(name);
    await modal.getByPlaceholder('搜索商品名称').press('Enter');
    const row = modal.getByRole('listitem').filter({ hasText: name });
    await row.getByRole('button', { name: cjk('选择') }).click();
    await expect(row.getByRole('button', { name: cjk('已选') })).toBeDisabled();
    await adminPage.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  };
  const picked = adminPage.getByTestId('diy-picked');

  // Drop a 商品列表 (指定商品 is its default) and pick one product.
  await adminPage.goto(`/admin/diy/${pageId}`);
  await adminPage.getByRole('button', { name: /商品列表$/ }).click();
  await pick(firstName);
  await expect(picked).toHaveText([firstName]);
  await adminPage.getByRole('button', { name: cjk('保存') }).click();
  await expect(adminPage.getByText('未保存')).toHaveCount(0);

  const saved = await storedGoods();
  expect(saved.ids).toEqual([first]);
  expect(saved).not.toHaveProperty('list');

  // Opened again: the pick is back, resolved from its id alone. The only
  // component on the page, so its panel is the one open.
  await adminPage.reload();
  await expect(picked).toHaveText([firstName]);

  await pick(secondName);
  await expect(picked).toHaveText([firstName, secondName]);
  await adminPage.getByRole('button', { name: cjk('保存') }).click();
  await expect(adminPage.getByText('未保存')).toHaveCount(0);

  const resaved = await storedGoods();
  expect(resaved.ids).toEqual([first, second]);
});
