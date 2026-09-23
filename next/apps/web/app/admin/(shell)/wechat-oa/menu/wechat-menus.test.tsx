import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ErrorBody } from '@shop/contracts';
import type { WechatMenu } from '@shop/contracts/wechat-oa/schemas';
import {
  wechatOaMenuCreate,
  wechatOaMenuCurrent,
  wechatOaMenuList,
  wechatOaMenuPublish,
  wechatOaMenuUpdate,
} from '@shop/contracts/wechat-oa/wechat-oa.menu.contract';

import { resetApiConfig } from '@/admin/api/config';
import { on, respondWithError, stubRoutes, type ErrorStatus, type StubCall } from '@/test/api';
import { renderAdmin, testIdentity, zhName } from '@/test/render';

import { WechatMenusPage } from './wechat-menus';

/**
 * The menu screen as a component test: no browser, no server, one stub `fetch`.
 *
 * What is worth asserting here is the separation the whole domain rests on —
 * 保存 writes a draft, 发布 is the only thing that reaches WeChat, and it is a
 * different permission — plus that the tree editor produces WeChat's own shape.
 */

const menu: WechatMenu = {
  id: '1',
  name: '默认菜单',
  buttons: [
    {
      name: '商城',
      sub_button: [{ name: '首页', type: 'view', url: 'https://shop.example.com/' }],
    },
    { name: '联系客服', type: 'click', key: 'CONTACT' },
  ],
  isActive: true,
  publishedAt: '2026-01-04T10:30:00+08:00',
  publishError: null,
  createdAt: '2026-01-04T10:00:00+08:00',
  updatedAt: '2026-01-04T10:30:00+08:00',
};

function stubApi(
  options: {
    publishError?: string;
    /** Rows listed after the live one. */
    drafts?: WechatMenu[];
    /** Answer 发布 with this refusal instead of the menu. */
    refusePublish?: { status: ErrorStatus; body: ErrorBody };
  } = {},
): StubCall[] {
  const items = [menu, ...(options.drafts ?? [])];
  const { refusePublish } = options;
  return stubRoutes([
    on(wechatOaMenuCurrent, { ...menu, publishError: options.publishError ?? null }),
    on(wechatOaMenuList, { items, total: items.length, page: 1, pageSize: 20 }),
    on(wechatOaMenuPublish, () =>
      refusePublish ? respondWithError(refusePublish.status, refusePublish.body) : menu,
    ),
    on(wechatOaMenuCreate, menu),
    on(wechatOaMenuUpdate, menu),
  ]);
}

afterEach(() => {
  resetApiConfig();
});

const allPermissions = {
  ...testIdentity,
  permissions: ['wechat-oa:menu:read', 'wechat-oa:menu:write', 'wechat-oa:menu:publish'],
};

describe('公众号自定义菜单', () => {
  it('lists menus from the contract route and summarises the tree', async () => {
    const calls = stubApi();
    renderAdmin(<WechatMenusPage />, { identity: allPermissions });

    expect(await screen.findByText('默认菜单')).toBeInTheDocument();
    // One glance has to tell two drafts apart without opening either.
    expect(screen.getByText('商城（1） · 联系客服')).toBeInTheDocument();
    expect(screen.getByText('已生效')).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes('/admin-api/wechat-menus?page=1'))).toBe(true);
  });

  it('shows the last publish failure, which a toast would already have hidden', async () => {
    stubApi({ publishError: '40016 invalid button type' });
    renderAdmin(<WechatMenusPage />, { identity: allPermissions });

    expect(await screen.findByText('上次发布失败')).toBeInTheDocument();
    expect(screen.getByText('40016 invalid button type')).toBeInTheDocument();
  });

  it('shows a refused draft’s error on its own row', async () => {
    // The alert reads the *live* menu; the draft WeChat refused keeps its
    // error on its own row, and that is where it has to be read.
    stubApi({
      drafts: [
        {
          ...menu,
          id: '2',
          name: '清明菜单',
          isActive: false,
          publishedAt: null,
          publishError: '发布菜单失败：invalid button size (40016)',
        },
      ],
    });
    renderAdmin(<WechatMenusPage />, { identity: allPermissions });

    const row = (await screen.findByText('清明菜单')).closest('tr')!;
    expect(within(row).getByText('草稿')).toBeInTheDocument();
    expect(within(row).getByText('发布失败')).toBeInTheDocument();
    expect(within(row).getByText(/40016/)).toBeInTheDocument();
    // …and not on the live row, nor in the alert.
    const live = screen.getByText('默认菜单').closest('tr')!;
    expect(within(live).queryByText('发布失败')).not.toBeInTheDocument();
    expect(screen.queryByText('上次发布失败')).not.toBeInTheDocument();
  });

  it('re-reads the list and the alert when WeChat refuses, not only on success', async () => {
    const calls = stubApi({
      refusePublish: {
        status: 502,
        body: {
          code: 'WECHAT_OA_API_FAILED',
          message: '发布菜单失败：invalid button size (40016)',
          details: { errcode: 40016, errmsg: 'invalid button size' },
        },
      },
    });
    renderAdmin(<WechatMenusPage />, { identity: allPermissions });
    await screen.findByText('默认菜单');
    const reads = (part: string) =>
      calls.filter((call) => call.method === 'GET' && call.url.includes(part)).length;
    const listBefore = reads('/admin-api/wechat-menus?');
    const currentBefore = reads('/current');

    await userEvent.click(screen.getByRole('button', { name: zhName('发布') }));
    await userEvent.click(await screen.findByRole('button', { name: zhName('确定') }));

    await waitFor(() => {
      expect(reads('/admin-api/wechat-menus?')).toBeGreaterThan(listBefore);
      expect(reads('/current')).toBeGreaterThan(currentBefore);
    });
  });

  it('publishes through the publish sub-resource, not by saving', async () => {
    const calls = stubApi();
    renderAdmin(<WechatMenusPage />, { identity: allPermissions });
    await screen.findByText('默认菜单');

    await userEvent.click(screen.getByRole('button', { name: zhName('发布') }));
    await userEvent.click(await screen.findByRole('button', { name: zhName('确定') }));

    await waitFor(() => {
      const publish = calls.find((call) => call.url.includes('/publish'));
      expect(publish?.method).toBe('POST');
      expect(publish?.url).toContain('/admin-api/wechat-menus/1/publish');
    });
  });

  it('keeps publishing away from an admin who may only edit drafts', async () => {
    stubApi();
    renderAdmin(<WechatMenusPage />, {
      identity: { ...testIdentity, permissions: ['wechat-oa:menu:read', 'wechat-oa:menu:write'] },
    });

    await screen.findByText('默认菜单');
    expect(screen.getByRole('button', { name: zhName('编辑') })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('发布') })).not.toBeInTheDocument();
  });

  it('hides every write action from a read-only admin', async () => {
    stubApi();
    renderAdmin(<WechatMenusPage />, {
      identity: { ...testIdentity, permissions: ['wechat-oa:menu:read'] },
    });

    await screen.findByText('默认菜单');
    expect(screen.queryByRole('button', { name: zhName('新建菜单') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('编辑') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('删除') })).not.toBeInTheDocument();
  });

  // Interaction-heavy: a dialog, four controls and a round trip. Vitest's 5 s
  // default is enough alone but not with ten packages compiling beside it.
  it('saves the tree in WeChat’s own shape', { timeout: 20_000 }, async () => {
    const calls = stubApi();
    renderAdmin(<WechatMenusPage />, { identity: allPermissions });
    await screen.findByText('默认菜单');

    await userEvent.click(screen.getByRole('button', { name: zhName('新建菜单') }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText('名称'), '春节菜单');
    await userEvent.type(within(dialog).getByLabelText('一级按钮 1 名称'), '领红包');
    await userEvent.type(
      within(dialog).getByLabelText('一级按钮 1 网页地址'),
      'https://shop.example.com/spring',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: zhName('保存') }));

    await waitFor(() => {
      const save = calls.find((call) => call.method === 'POST' && !call.url.includes('/publish'));
      expect(save?.body).toEqual({
        name: '春节菜单',
        buttons: [{ name: '领红包', type: 'view', url: 'https://shop.example.com/spring' }],
      });
    });
  });

  it('refuses to let a parent button carry an action of its own', { timeout: 20_000 }, async () => {
    stubApi();
    renderAdmin(<WechatMenusPage />, { identity: allPermissions });
    await screen.findByText('默认菜单');

    await userEvent.click(screen.getByRole('button', { name: zhName('新建菜单') }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('一级按钮 1 网页地址')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: zhName('添加子菜单') }));

    // WeChat ignores an action on a button that has children, which is how an
    // operator ends up convinced "the link does not work".
    expect(within(dialog).queryByLabelText('一级按钮 1 网页地址')).not.toBeInTheDocument();
    // …and the child it just gained has one of its own.
    expect(within(dialog).getByLabelText('二级按钮 1-1 网页地址')).toBeInTheDocument();
    expect(within(dialog).getByText(/有子菜单的按钮本身不触发动作/)).toBeInTheDocument();
  });
});
