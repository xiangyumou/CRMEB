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
