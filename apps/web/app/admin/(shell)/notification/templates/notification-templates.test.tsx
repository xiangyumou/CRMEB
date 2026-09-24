import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  notificationAdminTemplateList,
  notificationAdminTemplatePreview,
  notificationAdminTemplateTestSend,
  notificationAdminTemplateUpdate,
} from '@shop/contracts/notification/notification.admin.contract';
import {
  notificationTemplateExample,
  type NotificationTemplate,
} from '@shop/contracts/notification/schemas';

import { resetApiConfig } from '@/admin/api/config';
import { on, stubRoutes, type StubCall } from '@/test/api';
import { renderAdmin, testIdentity, zhName } from '@/test/render';

import { NotificationTemplatesPage } from './notification-templates';

/**
 * 预览 / 测试发送 in the template form. What matters is that both read the form
 * as it stands — an unsaved edit included — and that a test send is asked for
 * before it goes out.
 */

const template = notificationTemplateExample as NotificationTemplate;

function stubApi(): StubCall[] {
  return stubRoutes([
    on(notificationAdminTemplateList, { items: [template], total: 1, page: 1, pageSize: 20 }),
    on(notificationAdminTemplateUpdate, template),
    on(notificationAdminTemplatePreview, {
      inApp: {
        enabled: true,
        title: '您的订单已发货',
        content: '订单 SO202609240001 已发出',
        opens: 'packages/order/detail/index?id=1001',
      },
      wechatOa: null,
      wechatMini: null,
      sms: null,
      warnings: ['{{trackngNo}} 不是这个通知的变量（用在：站内信正文），发出去会是空的'],
    }),
    on(notificationAdminTemplateTestSend, {
      outcome: 'skipped',
      message: '没有发出：该会员没有关注公众号或没有公众号授权记录',
    }),
  ]);
}

afterEach(() => {
  resetApiConfig();
});

const user = userEvent.setup({ pointerEventsCheck: 0 });

const writer = {
  ...testIdentity,
  permissions: ['notification:template:read', 'notification:template:write'],
};

async function openPreview(): Promise<HTMLElement> {
  await user.click(await screen.findByText('配置'));
  const form = await screen.findByRole('dialog');
  const title = within(form).getByLabelText('站内信标题');
  await user.clear(title);
  await user.type(title, '未保存的标题');
  await user.click(within(form).getByTestId('notification-preview'));
  return (await screen.findAllByRole('dialog')).at(-1)!;
}

describe('通知模板', () => {
  it('previews the unsaved form with sample values', { timeout: 20_000 }, async () => {
    const calls = stubApi();
    renderAdmin(<NotificationTemplatesPage />, { identity: writer });

    const dialog = await openPreview();
    expect(await within(dialog).findByTestId('notification-preview-result')).toBeInTheDocument();
    expect(within(dialog).getByText(/不是这个通知的变量/)).toBeInTheDocument();

    const call = calls.find((c) => c.url.endsWith('/notification-templates/order_shipped/preview'));
    const body = call?.body as {
      channels: { inApp: { title: string } };
      data: Record<string, string>;
    };
    expect(body.channels.inApp.title).toBe('未保存的标题');
    expect(body.data['orderNo']).toBe('SO202609240001');
  });

  it('asks before a test send and shows why nothing went out', { timeout: 20_000 }, async () => {
    const calls = stubApi();
    renderAdmin(<NotificationTemplatesPage />, { identity: writer });

    const dialog = await openPreview();
    await user.type(within(dialog).getByLabelText('会员 ID'), '10001');
    await user.click(within(dialog).getByTestId('notification-test-send'));
    expect(calls.some((c) => c.url.endsWith('/test-send'))).toBe(false);

    const confirm = (await screen.findByText('确定真实发送？')).closest('.ant-popover');
    await user.click(within(confirm as HTMLElement).getByRole('button', { name: zhName('发送') }));
    expect(await within(dialog).findByText(/该会员没有关注公众号/)).toBeInTheDocument();
    await waitFor(() => {
      const call = calls.find((c) => c.url.endsWith('/order_shipped/test-send'));
      expect(call?.body).toMatchObject({ channel: 'wechatOa', userId: '10001' });
    });
  });

  it('offers no test send to a read-only admin', { timeout: 20_000 }, async () => {
    stubApi();
    renderAdmin(<NotificationTemplatesPage />, {
      identity: { ...testIdentity, permissions: ['notification:template:read'] },
    });

    await user.click(await screen.findByText('配置'));
    const form = await screen.findByRole('dialog');
    await user.click(within(form).getByTestId('notification-preview'));
    const dialog = (await screen.findAllByRole('dialog')).at(-1)!;
    await within(dialog).findByTestId('notification-preview-result');
    expect(within(dialog).queryByTestId('notification-test-send')).not.toBeInTheDocument();
  });
});
