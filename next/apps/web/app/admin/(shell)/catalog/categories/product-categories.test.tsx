import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity, zhName } from '@/test/render';

import { ProductCategoriesPage } from './product-categories';

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const row = {
  id: '17',
  parentId: '3',
  name: '男装',
  path: '/3/',
  level: 1,
  iconUrl: null,
  bannerUrl: null,
  sortOrder: 5,
  isVisible: true,
  productCount: 42,
  createdAt: '2026-06-01T10:00:00+08:00',
};

function stubApi(): Call[] {
  const calls: Call[] = [];
  configureApi({
    async fetch(input, init) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? 'GET';
      calls.push({
        method,
        url,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const payload = url.includes('/category-tree')
        ? { items: [] }
        : method === 'GET'
          ? { items: [row], total: 1, page: 1, pageSize: 20 }
          : { ...row, isVisible: false };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  return calls;
}

afterEach(() => {
  resetApiConfig();
});

const writer = {
  ...testIdentity,
  permissions: ['catalog:category:read', 'catalog:category:write'],
};

describe('商品分类', () => {
  it('lists categories with their level and product count', async () => {
    const calls = stubApi();
    renderAdmin(<ProductCategoriesPage />, { identity: writer });

    expect(await screen.findByText('男装')).toBeInTheDocument();
    expect(screen.getByText('2 级')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/admin-api/catalog/categories?');
  });

  it('hides the write actions from a read-only admin', async () => {
    stubApi();
    renderAdmin(<ProductCategoriesPage />, {
      identity: { ...testIdentity, permissions: ['catalog:category:read'] },
    });

    await screen.findByText('男装');
    expect(screen.queryByRole('button', { name: zhName('新建分类') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('隐藏') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('删除') })).not.toBeInTheDocument();
  });

  it('hides a category through the visibility sub-resource, not the edit form', async () => {
    const calls = stubApi();
    renderAdmin(<ProductCategoriesPage />, { identity: writer });
    await screen.findByText('男装');

    await userEvent.click(screen.getByRole('button', { name: zhName('隐藏') }));

    await waitFor(() => {
      const toggle = calls.find((call) => call.method === 'POST');
      expect(toggle?.url).toContain('/admin-api/catalog/categories/17/visibility');
      expect(toggle?.body).toEqual({ isVisible: false });
    });
  });

  it('edits through the contract body, keeping the parent id it was filed under', async () => {
    const calls = stubApi();
    renderAdmin(<ProductCategoriesPage />, { identity: writer });
    await screen.findByText('男装');

    await userEvent.click(screen.getByRole('button', { name: zhName('编辑') }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('分类名称');
    await userEvent.clear(name);
    await userEvent.type(name, '女装');
    await userEvent.click(within(dialog).getByRole('button', { name: zhName('保存') }));

    await waitFor(() => {
      const save = calls.find((call) => call.method === 'PUT');
      expect(save?.url).toContain('/admin-api/catalog/categories/17');
      // `parentId` is a real `null`-able value, not an optional one: `null`
      // means "a root category", and it must survive an edit untouched.
      expect(save?.body).toMatchObject({ name: '女装', parentId: '3', sortOrder: 5 });
    });
  });
});
