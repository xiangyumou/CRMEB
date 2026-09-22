import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity } from '@/test/render';

import { ArticleCategoriesPage } from './article-categories';

/**
 * 文章分类 as a component test.
 *
 * The wiring worth asserting: the whole tree comes from one unpaged route, the
 * indent is the server's `depth` and not a tree the client re-derived, 前台显示
 * goes through the status sub-resource, and only a top-level category is
 * offered as a parent — which is how the form keeps the two-level rule the
 * server enforces.
 */

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const parent = {
  id: '3',
  parentId: null,
  title: '新闻资讯',
  intro: '商城公告与行业动态',
  imageUrl: null,
  status: 'visible',
  sortOrder: 10,
  depth: 0,
  articleCount: 12,
  createdAt: '2026-01-01T09:00:00+08:00',
};

const child = {
  ...parent,
  id: '4',
  parentId: '3',
  title: '商城公告',
  intro: null,
  sortOrder: 20,
  depth: 1,
  articleCount: 5,
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
      const payload =
        method === 'GET' ? { items: [parent, child] } : { ...parent, status: 'hidden' };
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
  permissions: ['cms:article:read', 'cms:category:write'],
};

describe('文章分类', () => {
  it('asks one unpaged route for the whole tree', async () => {
    const calls = stubApi();
    renderAdmin(<ArticleCategoriesPage />, { identity: writer });

    expect(await screen.findByText('新闻资讯')).toBeInTheDocument();
    expect(screen.getByText('商城公告')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/admin-api/cms/article-categories');
    expect(calls[0]?.url).not.toContain('page=');
  });

  it('hides the write controls from an admin without cms:category:write', async () => {
    stubApi();
    renderAdmin(<ArticleCategoriesPage />, {
      identity: { ...testIdentity, permissions: ['cms:article:read'] },
    });

    await screen.findByText('新闻资讯');
    expect(screen.queryByRole('button', { name: /新建分类/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getAllByText('显示')).not.toHaveLength(0);
  });

  it('hides a category through the status sub-resource', async () => {
    const calls = stubApi();
    renderAdmin(<ArticleCategoriesPage />, { identity: writer });
    await screen.findByText('新闻资讯');

    await userEvent.click(screen.getAllByRole('switch')[0]!);

    await waitFor(() => {
      const flip = calls.find((call) => call.method === 'POST');
      expect(flip?.url).toContain('/admin-api/cms/article-categories/3/status');
      expect(flip?.body).toEqual({ status: 'hidden' });
    });
  });

  it('offers only top-level categories as a parent', async () => {
    stubApi();
    renderAdmin(<ArticleCategoriesPage />, { identity: writer });
    await screen.findByText('新闻资讯');

    await userEvent.click(screen.getByRole('button', { name: /新建分类/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText('上级分类'));

    // The child is not offered: antd labels the option, whose own text is the value.
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual(['新闻资讯']);
  });
});
