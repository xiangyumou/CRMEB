import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setSubscribeTemplates } from '@/platform';
import { useSession } from '@/session/session';
import { serveApi } from '@/test/fake-api';
import { refundDetail } from '@/test/order-fixtures';
import { renderPage } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import ReturnShipmentPage, { cleanTrackingNo, matchCompanies, PICKER_LIMIT } from './index';

const approved = refundDetail({
  kind: 'return_and_refund',
  status: 'approved',
  returnStage: 'awaiting_shipment',
  returnAddress: { name: '售后部', phone: '02000000000', address: '广州市天河区某路 1 号' },
});

const companies = {
  items: [
    { id: '12', code: 'shunfeng', name: '顺丰速运', sortOrder: 100 },
    { id: '13', code: 'zhongtong', name: '中通快递', sortOrder: 90 },
    { id: '14', code: 'yunda', name: '韵达快递', sortOrder: 0 },
  ],
};

function serve(refund = approved) {
  return serveApi({
    'GET /api/v1/refunds/601': () => ({ body: refund }),
    'GET /api/v1/express-companies': () => ({ body: companies }),
    'POST /api/v1/refunds/601/return-shipment': () => ({
      body: { ...refund, returnStage: 'shipped_back', returnTrackingNo: 'SF123' },
    }),
  });
}

describe('matchCompanies / cleanTrackingNo', () => {
  it('finds by name or code and caps the list', () => {
    expect(matchCompanies(companies.items, '中通').map((c) => c.id)).toEqual(['13']);
    expect(matchCompanies(companies.items, 'YUN').map((c) => c.id)).toEqual(['14']);
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      code: `c${i}`,
      name: `快递${i}`,
      sortOrder: 0,
    }));
    expect(matchCompanies(many, '')).toHaveLength(PICKER_LIMIT);
  });

  it('drops spaces and upper-cases a waybill number', () => {
    expect(cleanTrackingNo(' sf 1234 5678 ')).toBe('SF12345678');
  });
});

describe('填写退货物流', () => {
  beforeEach(() => {
    useSession.setState({ session: { status: 'signed-in', token: 't' } });
    taroFake.routerParams = { id: '601' };
    taroFake.pageStackDepth = 2;
  });
  afterEach(() => setSubscribeTemplates({}));

  it('sends the courier, number and phone, asking for notices first, then goes back', async () => {
    setSubscribeTemplates({ returnShipment: ['tpl-return'] });
    const seen = serve();
    await renderPage(<ReturnShipmentPage />);
    await screen.findByText('广州市天河区某路 1 号');

    fireEvent.click(screen.getByRole('link', { name: '选择快递公司' }));
    fireEvent.change(await screen.findByRole('textbox', { name: '搜索快递公司' }), {
      target: { value: '中通' },
    });
    expect(screen.queryByRole('radio', { name: '顺丰速运' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: '中通快递' }));
    fireEvent.change(screen.getByRole('textbox', { name: '快递单号' }), {
      target: { value: 'zt 7788 9900' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '联系电话' }), {
      target: { value: '13800000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({ api: 'navigateBack', args: { delta: 1 } }),
    );
    expect(seen.find((r) => r.key === 'POST /api/v1/refunds/601/return-shipment')?.body).toEqual({
      expressCompanyId: '13',
      trackingNo: 'ZT77889900',
      phone: '13800000000',
    });
    const apis = taroFake.calls.map((c) => c.api);
    const posted = taroFake.calls.findIndex(
      (c) => c.api === 'request' && (c.args as { method: string }).method === 'POST',
    );
    expect(apis.indexOf('requestSubscribeMessage')).toBeGreaterThanOrEqual(0);
    expect(apis.indexOf('requestSubscribeMessage')).toBeLessThan(posted);
  });

  it('asks for the courier and the number before sending anything', async () => {
    const seen = serve();
    await renderPage(<ReturnShipmentPage />);
    await screen.findByText('广州市天河区某路 1 号');
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(taroFake.calls).toContainEqual({
      api: 'showToast',
      args: expect.objectContaining({ title: '请选择快递公司' }),
    });
    fireEvent.click(screen.getByRole('link', { name: '选择快递公司' }));
    fireEvent.click(await screen.findByRole('radio', { name: '顺丰速运' }));
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(taroFake.calls).toContainEqual({
      api: 'showToast',
      args: expect.objectContaining({ title: '请填写快递单号' }),
    });
    expect(seen.some((r) => r.key === 'POST /api/v1/refunds/601/return-shipment')).toBe(false);
  });

  it('says so when nothing needs sending back', async () => {
    serve(refundDetail({ status: 'applied' }));
    await renderPage(<ReturnShipmentPage />);
    await screen.findByText('这个售后单无需寄回商品');
    fireEvent.click(screen.getByRole('button', { name: '查看售后详情' }));
    expect(taroFake.calls).toContainEqual({
      api: 'redirectTo',
      args: { url: '/packages/aftersale/detail/index?id=601' },
    });
  });
});
