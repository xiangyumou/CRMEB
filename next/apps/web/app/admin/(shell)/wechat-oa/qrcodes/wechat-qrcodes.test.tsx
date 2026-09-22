import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity, zhName } from '@/test/render';

import { WechatQrcodesPage } from './wechat-qrcodes';

/**
 * The channel-code screen as a component test.
 *
 * The one thing worth guarding hardest is that the scene string is offered
 * once and never again: the poster carrying it is already printed, so an edit
 * form that showed the field would be an edit form that can silently
 * re-attribute somebody else's scans.
 */

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const qrcode = {
  id: '1',
  categoryId: '1',
  categoryName: '线下门店',
  name: '朝阳门店海报',
  scene: 'CH_A1B2C3',
  ticket: 'gQH7...==',
  imageUrl: 'https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=gQH7',
  expiresAt: null,
  replyType: 'text',
  replyPayload: { text: '欢迎关注' },
  scanCount: 128,
  followCount: 47,
  status: 'active',
  createdAt: '2026-01-04T10:00:00+08:00',
  updatedAt: '2026-01-06T09:00:00+08:00',
};

const category = {
  id: '1',
  name: '线下门店',
  sortOrder: 0,
  qrcodeCount: 3,
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
      const payload = url.includes('/statistic')
        ? {
            qrcodeId: '1',
            name: '朝阳门店海报',
            scanCount: 128,
            followCount: 47,
            uniqueScanners: 96,
            points: [{ date: '2026-01-06', scans: 77, newFollowers: 28 }],
          }
        : url.includes('/scans')
          ? { items: [], total: 0, page: 1, pageSize: 20 }
          : url.includes('wechat-qrcode-categories')
            ? { items: [category], total: 1, page: 1, pageSize: 200 }
            : url.includes('wechat-media')
              ? { items: [], total: 0, page: 1, pageSize: 100 }
              : method === 'GET'
                ? { items: [qrcode], total: 1, page: 1, pageSize: 20 }
                : { ...qrcode, status: 'disabled' };
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
  permissions: ['wechat-oa:qrcode:read', 'wechat-oa:qrcode:write'],
};

describe('渠道二维码', () => {
  it('lists codes with the scene string that attributes their scans', async () => {
    const calls = stubApi();
    renderAdmin(<WechatQrcodesPage />, { identity: allPermissions });

    expect(await screen.findByText('朝阳门店海报')).toBeInTheDocument();
    expect(screen.getByText('CH_A1B2C3')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes('/admin-api/wechat-qrcodes?'))).toBe(true);
  });

  // Opens two dialogs in one test; see the note in the menu page's tests.
  it('offers the scene string on create only', { timeout: 20_000 }, async () => {
    stubApi();
    renderAdmin(<WechatQrcodesPage />, { identity: allPermissions });
    await screen.findByText('朝阳门店海报');

    await userEvent.click(screen.getByRole('button', { name: zhName('新建渠道码') }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('场景值')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('有效期')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: zhName('取消') }));

    await userEvent.click(screen.getByRole('button', { name: zhName('编辑') }));
    dialog = await screen.findByRole('dialog');
    // The poster is already on a wall; re-pointing its scene would silently
    // re-attribute every future scan of it.
    expect(within(dialog).queryByLabelText('场景值')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('有效期')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('名称')).toHaveValue('朝阳门店海报');
  });

  it('toggles the status through the sub-resource', async () => {
    const calls = stubApi();
    renderAdmin(<WechatQrcodesPage />, { identity: allPermissions });
    await screen.findByText('朝阳门店海报');

    await userEvent.click(screen.getByRole('button', { name: zhName('停用') }));

    await waitFor(() => {
      const toggle = calls.find((call) => call.url.includes('/status'));
      expect(toggle?.method).toBe('POST');
      expect(toggle?.body).toEqual({ status: 'disabled' });
    });
  });

  // A drawer with a table of its own inside it; same note as above.
  it('shows scans, unique scanners and follows side by side', { timeout: 20_000 }, async () => {
    stubApi();
    renderAdmin(<WechatQrcodesPage />, { identity: allPermissions });
    await screen.findByText('朝阳门店海报');

    await userEvent.click(screen.getByRole('button', { name: zhName('统计') }));

    // 128 deliveries from 96 people producing 47 follows is a different story
    // from any one of those numbers alone.
    expect(await screen.findByText('扫码人数')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.getByText('2026-01-06')).toBeInTheDocument();
  });

  it('hides every write action from a read-only admin', async () => {
    stubApi();
    renderAdmin(<WechatQrcodesPage />, {
      identity: { ...testIdentity, permissions: ['wechat-oa:qrcode:read'] },
    });

    await screen.findByText('朝阳门店海报');
    expect(screen.queryByRole('button', { name: zhName('新建渠道码') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('编辑') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('删除') })).not.toBeInTheDocument();
    // Reading the statistics is part of 读 permission, so it stays.
    expect(screen.getByRole('button', { name: zhName('统计') })).toBeInTheDocument();
  });
});
