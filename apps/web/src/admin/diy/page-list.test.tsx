import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  diyPageCopy,
  diyPageCreate,
  diyPageList,
  diyPagePublish,
  diyPageSetHome,
} from '@shop/contracts/diy/diy.contract';
import type { DiyPageDetail, DiyPageSummary } from '@shop/contracts/diy/schemas';

import { resetApiConfig } from '@/admin/api/config';
import { on, stubRoutes, type StubCall } from '@/test/api';
import { renderAdmin, testIdentity } from '@/test/render';

import { DiyPageList } from './page-list';

/**
 * The 页面装修 list as a component test: no browser, no server, one stub `fetch`.
 *
 * What is worth asserting on a kit-built page is the *wiring* — which route the
 * table asks, that permissions really hide the actions, and what body an action
 * sends. Paging, sorting and form rendering belong to the kit's own tests.
 */

const home: DiyPageSummary = {
  id: '8',
  name: '首页',
  kind: 'home',
  title: '首页',
  status: 'published',
  isHome: true,
  componentCount: 12,
  version: 'v8',
  publishedAt: '2026-06-01T10:00:00+08:00',
  updatedAt: '2026-06-01T10:00:00+08:00',
  createdAt: '2026-05-01T10:00:00+08:00',
};

const draft: DiyPageSummary = {
  ...home,
  id: '9',
  name: '活动专题页',
  kind: 'micro',
  status: 'draft',
  isHome: false,
  componentCount: 3,
  version: 'v9',
  publishedAt: null,
};

function stubApi(): StubCall[] {
  // Every single-page route answers with the whole page, content included.
  const detail: DiyPageDetail = { ...draft, content: {}, schemaVersion: 1, background: null };
  return stubRoutes([
    on(diyPageList, { items: [home, draft], total: 2, page: 1, pageSize: 20 }),
    on(diyPageCreate, detail),
    on(diyPagePublish, { ...detail, status: 'published' }),
    on(diyPageSetHome, detail),
    on(diyPageCopy, detail),
  ]);
}

afterEach(() => {
  resetApiConfig();
});

const allPermissions = {
  ...testIdentity,
  permissions: [
    'diy:page:read',
    'diy:page:create',
    'diy:page:update',
    'diy:page:delete',
    'diy:page:publish',
    'diy:theme:update',
    'diy:link:read',
  ],
};

/** The row of action buttons for a page, found by its name cell. */
function rowOf(name: string): HTMLElement {
  const cell = screen.getByRole('link', { name });
  const row = cell.closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe('页面装修列表', () => {
  it('lists pages from the contract route', async () => {
    const calls = stubApi();
    renderAdmin(<DiyPageList />, { identity: allPermissions });

    expect(await screen.findByRole('link', { name: '首页' })).toBeInTheDocument();
    expect(screen.getByText('微页面')).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/admin-api/diy/pages?');
    expect(calls[0]?.url).toContain('page=1');
  });

  it('opens the editor from the name and the 装修 action', async () => {
    stubApi();
    renderAdmin(<DiyPageList />, { identity: allPermissions });

    const name = await screen.findByRole('link', { name: '首页' });
    expect(name).toHaveAttribute('href', '/admin/diy/8');
    expect(within(rowOf('首页')).getByRole('link', { name: '装修' })).toHaveAttribute(
      'href',
      '/admin/diy/8',
    );
  });

  it('hides every write action from a read-only admin', async () => {
    stubApi();
    renderAdmin(<DiyPageList />, {
      identity: { ...testIdentity, permissions: ['diy:page:read'] },
    });

    await screen.findByRole('link', { name: '首页' });
    expect(screen.queryByRole('button', { name: '新建页面' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发布' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '设为首页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '还原默认' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('never offers to delete or re-publish the page that is live', async () => {
    stubApi();
    renderAdmin(<DiyPageList />, { identity: allPermissions });
    await screen.findByRole('link', { name: '首页' });

    const live = within(rowOf('首页'));
    expect(live.getByRole('button', { name: '删除' })).toBeDisabled();
    expect(live.getByRole('button', { name: '发布' })).toBeDisabled();
    expect(live.getByRole('button', { name: '设为首页' })).toBeDisabled();

    // The draft may be published, and a 微页面 may not become the home page.
    const other = within(rowOf('活动专题页'));
    expect(other.getByRole('button', { name: '发布' })).toBeEnabled();
    expect(other.queryByRole('button', { name: '设为首页' })).not.toBeInTheDocument();
  });

  it('publishes through the sub-resource POST', async () => {
    const calls = stubApi();
    renderAdmin(<DiyPageList />, { identity: allPermissions });
    await screen.findByRole('link', { name: '活动专题页' });

    await userEvent.click(within(rowOf('活动专题页')).getByRole('button', { name: '发布' }));

    await waitFor(() => {
      const publish = calls.find((call) => call.method === 'POST');
      expect(publish?.url).toContain('/admin-api/diy/pages/9/publish');
      expect(publish?.body).toBeUndefined();
    });
  });

  it('creates a page with the contract body', async () => {
    const calls = stubApi();
    renderAdmin(<DiyPageList />, { identity: allPermissions });
    await screen.findByRole('link', { name: '首页' });

    await userEvent.click(screen.getByRole('button', { name: '新建页面' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('页面名称'), '双十一会场');
    await userEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => {
      const create = calls.find((call) => call.url.endsWith('/admin-api/diy/pages'));
      expect(create?.method).toBe('POST');
      expect(create?.body).toMatchObject({ name: '双十一会场', kind: 'micro' });
    });
  });
});
