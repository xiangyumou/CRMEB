import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { signIn } from '@/test/account-fixture';
import { serveApi } from '@/test/fake-api';
import { orderInvoiceFixture } from '@/test/invoice-fixture';
import { renderPage } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import InvoicePage from './index';

describe('发票详情', () => {
  beforeEach(() => {
    signIn();
    taroFake.routerParams = { id: '3001' };
  });

  it('withdraws a request after asking', async () => {
    let status = 'requested';
    const seen = serveApi({
      'GET /api/v1/invoices/3001': () => ({ body: { ...orderInvoiceFixture, status } }),
      'POST /api/v1/invoices/3001/cancel': () => {
        status = 'cancelled';
        return { body: { ...orderInvoiceFixture, status } };
      },
    });
    await renderPage(<InvoicePage />);

    expect(await screen.findByText('已提交，商家开具后会通知你')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '撤回申请' }));
    await waitFor(() =>
      expect(seen.map((r) => r.key)).toContain('POST /api/v1/invoices/3001/cancel'),
    );
    expect(await screen.findByRole('button', { name: '重新申请' })).toBeTruthy();
  });

  it('says why a request was not accepted', async () => {
    serveApi({
      'GET /api/v1/invoices/3001': () => ({
        body: { ...orderInvoiceFixture, status: 'rejected', remark: '税号与抬头不匹配' },
      }),
    });
    await renderPage(<InvoicePage />);
    expect(await screen.findByText('原因：税号与抬头不匹配')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新申请' }));
    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({
        api: 'navigateTo',
        args: { url: '/packages/account/invoice-apply/index?orderId=9001' },
      }),
    );
  });
});
