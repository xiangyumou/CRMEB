import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity } from '@/test/render';

import { ArticlesPage } from './articles';

/**
 * 文章管理 as a component test.
 *
 * The wiring worth asserting: the table asks the contract route, the category
 * filter is fed by the category route rather than a second query of its own,
 * 发布/隐藏 goes through the status sub-resource (not a column written straight
 * from the list), and 删除 sits on its own atom.
 */

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const row = {
  id: '101',
  categoryId: '3',
  categoryTitle: '新闻资讯',
  title: '双十一活动说明',
  slug: 'double-eleven-2026',
  author: '运营部',
  coverImageUrl: null,
  summary: null,
  sourceUrl: null,
  isHot: true,
  isBanner: false,
  views: 120,
  sortOrder: 50,
  publishedAt: '2026-06-01T10:00:00+08:00',
  status: 'published',
  productId: null,
  shareTitle: null,
  shareSummary: null,
  createdAt: '2026-06-01T09:00:00+08:00',
  updatedAt: '2026-06-01T09:00:00+08:00',
};

const category = {
  id: '3',
  parentId: null,
  title: '新闻资讯',
  intro: null,
  imageUrl: null,
  status: 'visible',
  sortOrder: 10,
  depth: 0,
  articleCount: 12,
  createdAt: '2026-01-01T09:00:00+08:00',
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
      const payload = url.includes('/admin-api/cms/article-categories')
        ? { items: [category] }
        : url.includes('/admin-api/catalog/products')
          ? { items: [], total: 0, page: 1, pageSize: 20 }
          : method === 'GET'
            ? { items: [row], total: 1, page: 1, pageSize: 20 }
            : { ...row, status: 'hidden' };
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
  permissions: ['cms:article:read', 'cms:article:write'],
};

describe('文章管理', () => {
  it('lists articles from the contract route and names their category', async () => {
    const calls = stubApi();
    renderAdmin(<ArticlesPage />, { identity: writer });

    expect(await screen.findByText('双十一活动说明')).toBeInTheDocument();
    expect(screen.getByText('已发布')).toBeInTheDocument();
    // 热门 is both a filter label and the row's tag.
    expect(screen.getAllByText('热门').length).toBeGreaterThan(1);
    expect(calls.some((call) => call.url.includes('/admin-api/cms/articles?page=1'))).toBe(true);
    // The 分类 filter is fed by the category route, not a second article query.
    expect(calls.some((call) => call.url.includes('/admin-api/cms/article-categories'))).toBe(true);
  });

  it('hides every write action from a read-only admin', async () => {
    stubApi();
    renderAdmin(<ArticlesPage />, {
      identity: { ...testIdentity, permissions: ['cms:article:read'] },
    });

    await screen.findByText('双十一活动说明');
    expect(screen.queryByRole('button', { name: /新建文章/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '隐藏' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('takes a published article down through the status sub-resource', async () => {
    const calls = stubApi();
    renderAdmin(<ArticlesPage />, { identity: writer });
    await screen.findByText('双十一活动说明');

    await userEvent.click(screen.getByRole('button', { name: '隐藏' }));

    await waitFor(() => {
      const flip = calls.find((call) => call.method === 'POST');
      expect(flip?.url).toContain('/admin-api/cms/articles/101/status');
      expect(flip?.body).toEqual({ status: 'hidden' });
    });
  });

  it('keeps 删除 on its own atom, which write alone does not grant', async () => {
    stubApi();
    renderAdmin(<ArticlesPage />, { identity: writer });

    await screen.findByText('双十一活动说明');
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });
});
