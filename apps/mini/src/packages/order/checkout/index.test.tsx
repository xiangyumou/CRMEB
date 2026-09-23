import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppConfigStore } from '@/app-config';
import { useCheckoutDraft, type CheckoutDraft } from '@/features/checkout/draft';
import { setSubscribeTemplates } from '@/platform';
import { startSession, useSession } from '@/session/session';
import { appConfigFixture } from '@/test/app-config-fixture';
import {
  applicableFixture,
  orderFixture,
  previewFixture,
  previewWithCoupon,
} from '@/test/checkout-fixture';
import { serveApi, type FakeReply } from '@/test/fake-api';
import { renderPage } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import CheckoutPage from './index';

type Routes = Record<string, (body: unknown) => FakeReply>;

const buyNow: CheckoutDraft = {
  source: 'buy-now',
  item: { skuId: '103', quantity: 2 },
  kind: 'normal',
};

function serve(overrides: Routes = {}) {
  return serveApi({
    'POST /api/v1/checkout/preview': (body) => ({
      body:
        (body as { userCouponId?: string | null }).userCouponId === 'uc1'
          ? previewWithCoupon()
          : previewFixture(),
    }),
    'POST /api/v1/user-coupons/applicable': () => ({ body: applicableFixture() }),
    'POST /api/v1/orders': () => ({ status: 201, body: orderFixture() }),
    ...overrides,
  });
}

async function open(draft: CheckoutDraft = buyNow) {
  useCheckoutDraft.setState({ draft });
  taroFake.storage.set('shop.session.token', 't1');
  await startSession();
  await renderPage(<CheckoutPage />);
}

const submitButton = () => screen.getByRole('button', { name: '提交订单' });
/** Priced and settled: the coupon list is in and the button no longer waits. */
const ready = () =>
  waitFor(() => expect(submitButton().getAttribute('aria-disabled')).not.toBe('true'));

describe('确认订单', () => {
  beforeEach(() => {
    useSession.setState({ session: { status: 'idle' } });
    useAppConfigStore.setState({ config: appConfigFixture, source: 'network' });
  });
  afterEach(() => setSubscribeTemplates({}));

  it('says so when there is nothing to check out', async () => {
    useCheckoutDraft.setState({ draft: null });
    await renderPage(<CheckoutPage />);
    expect(screen.getByText('没有待结算的商品')).toBeTruthy();
  });

  it('applies the best coupon, asks for subscriptions in the tap, and creates the order', async () => {
    setSubscribeTemplates({ checkout: ['tpl-paid', 'tpl-shipped'] });
    let askedFirst = false;
    const seen = serve({
      'POST /api/v1/orders': () => {
        // The prompt went out in the tap, before the order request (C08).
        askedFirst = taroFake.calls.some((call) => call.api === 'requestSubscribeMessage');
        return { status: 201, body: orderFixture() };
      },
    });
    await open();

    expect(await screen.findByText('-¥10.00')).toBeTruthy();
    await ready();
    expect(screen.getByText('林小姐')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('订单备注'), { target: { value: '工作日送达' } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({
        api: 'redirectTo',
        args: { url: '/packages/order/cashier/index?orderId=9' },
      }),
    );
    expect(taroFake.calls).toContainEqual({
      api: 'requestSubscribeMessage',
      args: expect.objectContaining({ tmplIds: ['tpl-paid', 'tpl-shipped'] }),
    });
    expect(askedFirst).toBe(true);
    const created = seen.find((r) => r.key === 'POST /api/v1/orders')?.body as Record<
      string,
      unknown
    >;
    expect(created).toMatchObject({
      source: 'buy-now',
      item: { skuId: '103', quantity: 2 },
      kind: 'normal',
      addressId: '301',
      userCouponId: 'uc1',
      expectedPayableAmount: '116.00',
      buyerRemark: '工作日送达',
    });
    expect(String(created.idempotencyKey)).toMatch(/^mini-/);
    expect(useCheckoutDraft.getState().draft).toBeNull();
  });

  it('lets the shopper drop the coupon', async () => {
    const seen = serve();
    await open();

    fireEvent.click(await screen.findByRole('link', { name: '优惠券，-¥10.00' }));
    const sheet = document.getElementById('coupon-sheet') as HTMLElement;
    expect(within(sheet).getByText('未达到使用门槛')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('radio', { name: '不使用优惠券' }));

    expect(await screen.findByText('不使用')).toBeTruthy();
    await ready();
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(seen.find((r) => r.key === 'POST /api/v1/orders')?.body).toMatchObject({
        userCouponId: null,
        expectedPayableAmount: '126.00',
      }),
    );
  });

  it('asks for an address before submitting, and imports WeChat’s', async () => {
    taroFake.address = {
      userName: '林小姐',
      telNumber: '13800138000',
      provinceName: '浙江省',
      cityName: '杭州市',
      countyName: '西湖区',
      detailInfo: '文三路 100 号',
      postalCode: '310012',
    };
    let created = false;
    const seen = serve({
      'POST /api/v1/checkout/preview': (body) => ({
        body: previewFixture({
          receiver: (body as { addressId?: string }).addressId === '302' ? undefined : null,
        } as never),
      }),
      'GET /api/v1/cities': () => ({ body: { version: 'v1', items: [] } }),
      'GET /api/v1/addresses': () => ({ body: { items: [], total: 0, page: 1, pageSize: 50 } }),
      'POST /api/v1/addresses': () => {
        created = true;
        return {
          status: 201,
          body: {
            id: '302',
            receiverName: '林小姐',
            receiverPhone: '13800138000',
            provinceId: null,
            cityId: null,
            districtId: null,
            provinceName: '浙江省',
            cityName: '杭州市',
            districtName: '西湖区',
            detail: '文三路 100 号',
            postCode: '310012',
            lng: null,
            lat: null,
            isDefault: true,
            createdAt: '2026-09-23T10:00:00+08:00',
            updatedAt: '2026-09-23T10:00:00+08:00',
          },
        };
      },
    });
    await open();

    await ready();
    fireEvent.click(submitButton());
    expect(seen.some((r) => r.key === 'POST /api/v1/orders')).toBe(false);

    // Submitting without an address opened the address sheet: import from its footer.
    await waitFor(() => expect(document.getElementById('address-sheet')).not.toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: '导入微信地址' }).at(-1) as HTMLElement);
    await waitFor(() => expect(created).toBe(true));
    expect(seen.find((r) => r.key === 'POST /api/v1/addresses')?.body).toMatchObject({
      receiverName: '林小姐',
      provinceName: '浙江省',
      postCode: '310012',
    });
    await waitFor(() =>
      expect(
        seen.some(
          (r) =>
            r.key === 'POST /api/v1/checkout/preview' &&
            (r.body as { addressId?: string }).addressId === '302',
        ),
      ).toBe(true),
    );
  });

  it('checks the custom form, and shows the presale ship time', async () => {
    const seen = serve({
      'POST /api/v1/checkout/preview': () => ({
        body: previewFixture({
          customFormFields: [{ key: 'words', label: '刻字内容', type: 'text', required: true }],
        }),
      }),
      'POST /api/v1/user-coupons/applicable': () => ({ body: { subtotal: '118.00', items: [] } }),
      'GET /api/v1/presale/activities/5': () => ({
        body: { activityId: '5', shipAfterDays: 7 },
      }),
    });
    await open({ ...buyNow, kind: 'presale', kindMeta: { activityId: '5' } });

    expect(await screen.findByText('预售商品：付款后 7 天内发货')).toBeTruthy();
    await ready();
    fireEvent.click(submitButton());
    expect(taroFake.calls).toContainEqual({
      api: 'showToast',
      args: expect.objectContaining({ title: '请填写「刻字内容」' }),
    });

    fireEvent.change(screen.getByLabelText('刻字内容'), { target: { value: '安' } });
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(seen.find((r) => r.key === 'POST /api/v1/orders')?.body).toMatchObject({
        kind: 'presale',
        kindMeta: { activityId: '5' },
        customForm: { words: '安' },
      }),
    );
  });

  it('re-prices when the price changed under the shopper', async () => {
    let previews = 0;
    serve({
      'POST /api/v1/checkout/preview': () => {
        previews += 1;
        return { body: previewFixture() };
      },
      'POST /api/v1/user-coupons/applicable': () => ({ body: { subtotal: '118.00', items: [] } }),
      'POST /api/v1/orders': () => ({
        status: 409,
        body: { code: 'ORDER_PRICE_CHANGED', message: '价格已变动' },
      }),
    });
    await open();

    await ready();
    const before = previews;
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({
        api: 'showToast',
        args: expect.objectContaining({ title: '商品价格有变动，请确认后重新提交' }),
      }),
    );
    await waitFor(() => expect(previews).toBeGreaterThan(before));
  });
});
