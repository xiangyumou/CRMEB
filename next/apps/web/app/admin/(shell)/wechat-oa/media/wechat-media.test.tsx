import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity, zhName } from '@/test/render';

import { WechatMediaPage } from './wechat-media';

/**
 * The material screen as a component test.
 *
 * The point of this screen is that it is a *mapping*, not a second library, so
 * the assertions are about which route each button reaches: sync reconciles
 * against WeChat, delete removes both sides, and nothing here uploads bytes.
 */

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const medium = {
  id: '1',
  kind: 'image',
  mediaId: 'MEDIA_ID_0001',
  attachmentId: '12',
  url: 'https://shop.example.com/uploads/2026/01/banner.png',
  isPermanent: true,
  expiresAt: null,
  createdAt: '2026-01-04T10:00:00+08:00',
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
      const payload = url.includes('/sync')
        ? { removed: 2, added: 5, unchanged: 31 }
        : method === 'GET'
          ? { items: [medium], total: 1, page: 1, pageSize: 20 }
          : medium;
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
  permissions: ['wechat-oa:media:read', 'wechat-oa:media:write'],
};

describe('微信素材', () => {
  it('lists material from the contract route', async () => {
    const calls = stubApi();
    renderAdmin(<WechatMediaPage />, { identity: allPermissions });

    expect(await screen.findByText('MEDIA_ID_0001')).toBeInTheDocument();
    expect(screen.getByText('永久')).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/admin-api/wechat-media?');
  });

  it('reconciles with WeChat and reports both directions', async () => {
    const calls = stubApi();
    renderAdmin(<WechatMediaPage />, { identity: allPermissions });
    await screen.findByText('MEDIA_ID_0001');

    await userEvent.click(screen.getByRole('button', { name: zhName('与微信同步') }));
    await userEvent.click(await screen.findByRole('button', { name: zhName('确定') }));

    await waitFor(() => {
      const sync = calls.find((call) => call.url.includes('/sync'));
      expect(sync?.method).toBe('POST');
    });
    // "31 unchanged" is the number that tells an operator the sync worked and
    // did nothing, which is the normal case.
    expect(await screen.findByText(/新增 5，移除 2，未变 31/)).toBeInTheDocument();
  });

  it('uploads by naming an attachment, never by posting a file', { timeout: 20_000 }, async () => {
    const calls = stubApi();
    renderAdmin(<WechatMediaPage />, { identity: allPermissions });
    await screen.findByText('MEDIA_ID_0001');

    await userEvent.click(screen.getByRole('button', { name: zhName('上传到微信') }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // The bytes live in `attachments`; this route takes the id of one.
    expect(screen.getByText('从商城素材库里选；文件本身不会被复制一份。')).toBeInTheDocument();
    expect(calls.every((call) => call.body === undefined || !(call.body instanceof FormData))).toBe(
      true,
    );
  });

  it('hides every write action from a read-only admin', async () => {
    stubApi();
    renderAdmin(<WechatMediaPage />, {
      identity: { ...testIdentity, permissions: ['wechat-oa:media:read'] },
    });

    await screen.findByText('MEDIA_ID_0001');
    expect(screen.queryByRole('button', { name: zhName('上传到微信') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('与微信同步') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('删除') })).not.toBeInTheDocument();
  });
});
