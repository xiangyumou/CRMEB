import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity } from '@/test/render';

import { CustomersPage } from './customers';

/**
 * 用户列表 as a component test: no browser, no server, one stub `fetch`.
 *
 * What is worth asserting on a kit-built page is the wiring — that the table
 * asks the contract's route, that the masked number is what an operator sees,
 * that each destructive action sits behind its own permission atom, and that a
 * click sends the body the contract declares. Paging, sorting and form
 * rendering are the kit's own tests' job.
 */

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const row = {
  id: '1001',
  account: '13800138000',
  phone: '138****8000',
  nickname: '小明',
  avatarUrl: null,
  status: 'active',
  registerSource: 'h5',
  groups: [{ id: '3', name: '高价值客户' }],
  labels: [{ id: '7', name: '母婴' }],
  lastLoginAt: '2026-09-20T08:31:00+08:00',
  createdAt: '2026-01-05T10:00:00+08:00',
};

/** The detail route's shape; the drawer reads every one of these. */
const detail = {
  ...row,
  phone: '13800138000',
  // Three fields the list row does not carry. They are here rather than `null`
  // so the edit test can watch them survive a save (CR-3-d2).
  realName: '王小明',
  birthday: null,
  adminRemark: '老客户，走加急',
  registerIp: '10.0.0.1',
  lastLoginIp: '10.0.0.2',
  hasPassword: true,
  boundWechat: ['mini'],
  addressCount: 1,
  deletedAt: null,
  updatedAt: '2026-09-20T08:31:00+08:00',
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

      const payload = url.includes('/admin-api/user-groups')
        ? {
            items: [
              {
                id: '3',
                name: '高价值客户',
                sortOrder: 0,
                memberCount: 1,
                createdAt: row.createdAt,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 100,
          }
        : url.includes('/admin-api/user-labels')
          ? {
              items: [
                {
                  id: '7',
                  categoryId: null,
                  categoryName: null,
                  name: '母婴',
                  sortOrder: 0,
                  memberCount: 1,
                  createdAt: row.createdAt,
                },
              ],
              total: 1,
              page: 1,
              pageSize: 200,
            }
          : url.includes('/password')
            ? { ok: true, revokedSessions: 2 }
            : url.includes('/group-assignments') || url.includes('/label-assignments')
              ? { affected: 1 }
              : method === 'GET' && url.includes('/admin-api/users?')
                ? { items: [row], total: 1, page: 1, pageSize: 20 }
                : { ...detail, status: 'disabled' };

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

const allPermissions = {
  ...testIdentity,
  permissions: [
    'user:customer:read',
    'user:customer:write',
    'user:customer:status',
    'user:customer:password',
    'user:group:read',
    'user:label:read',
  ],
};

describe('用户列表', () => {
  it('lists customers from the contract route, with the number masked', async () => {
    const calls = stubApi();
    renderAdmin(<CustomersPage />, { identity: allPermissions });

    expect(await screen.findByText('小明')).toBeInTheDocument();
    expect(screen.getByText('138****8000')).toBeInTheDocument();
    expect(screen.getByText('正常')).toBeInTheDocument();
    expect(screen.getByText('高价值客户')).toBeInTheDocument();

    const list = calls.find((call) => call.url.includes('/admin-api/users?'));
    expect(list?.url).toContain('page=1');
  });

  it('keeps 禁用 and 重置密码 behind their own permissions', async () => {
    stubApi();
    renderAdmin(<CustomersPage />, {
      // An operator who may edit a nickname but not end sessions.
      identity: { ...testIdentity, permissions: ['user:customer:read', 'user:customer:write'] },
    });

    await screen.findByText('小明');
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '禁用' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重置密码' })).not.toBeInTheDocument();
  });

  it('disables through the status sub-resource, not the edit form', async () => {
    const calls = stubApi();
    renderAdmin(<CustomersPage />, { identity: allPermissions });
    await screen.findByText('小明');

    await userEvent.click(screen.getByRole('button', { name: '禁用' }));

    await waitFor(() => {
      const toggle = calls.find((call) => call.url.includes('/admin-api/users/1001/status'));
      expect(toggle?.method).toBe('POST');
      expect(toggle?.body).toEqual({ status: 'disabled' });
    });
  });

  it('resets a password without ever sending it anywhere but the route', async () => {
    const calls = stubApi();
    renderAdmin(<CustomersPage />, { identity: allPermissions });
    await screen.findByText('小明');

    await userEvent.click(screen.getByRole('button', { name: '重置密码' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByPlaceholderText('6-64 位'), 'crmeb654321');
    await userEvent.click(within(dialog).getByRole('button', { name: '确认重置' }));

    await waitFor(() => {
      const reset = calls.find((call) => call.url.includes('/admin-api/users/1001/password'));
      expect(reset?.method).toBe('POST');
      expect(reset?.body).toEqual({ password: 'crmeb654321' });
    });
  });

  /**
   * CR-3-d2. 真实姓名 / 生日 / 管理员备注 live on the detail, not on the list
   * row, so 编辑 used to open them blank — and an empty antd box submits `''`,
   * which `user-admin.service.ts` writes, because it skips a field only when it
   * is `undefined`. Editing a nickname erased the operator's own notes.
   */
  it('loads the whole customer before editing, so the detail-only fields are not erased', async () => {
    const calls = stubApi();
    renderAdmin(<CustomersPage />, { identity: allPermissions });
    await screen.findByText('小明');

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/admin-api/users/1001'))).toBe(true);
    });

    // Filled from the detail, not blank.
    expect(await within(dialog).findByDisplayValue('王小明')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('老客户，走加急')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('昵称'));
    await userEvent.type(within(dialog).getByLabelText('昵称'), '小明改了名');
    await userEvent.click(within(dialog).getByRole('button', { name: '保 存' }));

    await waitFor(() => {
      const save = calls.find((call) => call.method === 'PUT');
      expect(save?.url).toContain('/admin-api/users/1001');
      expect(save?.body).toMatchObject({
        nickname: '小明改了名',
        realName: '王小明',
        adminRemark: '老客户，走加急',
      });
    });
  });

  it('fetches the unmasked number only when the detail drawer is opened', async () => {
    const calls = stubApi();
    renderAdmin(<CustomersPage />, { identity: allPermissions });
    await screen.findByText('小明');

    expect(calls.some((call) => call.url.endsWith('/admin-api/users/1001'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: '详情' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/admin-api/users/1001'))).toBe(true);
    });
  });
});
