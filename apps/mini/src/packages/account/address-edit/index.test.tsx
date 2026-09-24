import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { signIn } from '@/test/account-fixture';
import { addressFixture, cityTreeFixture } from '@/test/address-fixture';
import { serveApi } from '@/test/fake-api';
import { renderPage } from '@/test/render';
import { routeQueryKey } from '@shop/api-client/react';
import { taroFake } from '@/test/taro-fake/taro';
import { handOffImportedAddress } from '../shared/address';
import AddressEditPage from './index';

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('新增 / 编辑地址', () => {
  beforeEach(() => {
    signIn();
    taroFake.pageStackDepth = 2;
  });

  it('edits an address and saves it', async () => {
    taroFake.routerParams = { id: '31' };
    const seen = serveApi({
      'GET /api/v1/addresses/31': () => ({ body: addressFixture }),
      'GET /api/v1/cities': () => ({ body: cityTreeFixture }),
      'PUT /api/v1/addresses/31': (body) => ({ body: { ...addressFixture, ...(body as object) } }),
    });
    await renderPage(<AddressEditPage />);
    await screen.findByDisplayValue('李四');

    type('详细地址', '科技园路 5 号');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(seen.find((r) => r.key === 'PUT /api/v1/addresses/31')?.body).toEqual({
        receiverName: '李四',
        receiverPhone: '13900139000',
        provinceId: '44',
        cityId: '4403',
        districtId: '440305',
        provinceName: '广东省',
        cityName: '深圳市',
        districtName: '南山区',
        detail: '科技园路 5 号',
        isDefault: true,
      }),
    );
    await waitFor(() => expect(taroFake.calls.some((c) => c.api === 'navigateBack')).toBe(true));
  });

  it('makes 确认订单’s price stale: it prices against the default address underneath', async () => {
    taroFake.routerParams = { id: '31' };
    serveApi({
      'GET /api/v1/addresses/31': () => ({ body: addressFixture }),
      'GET /api/v1/cities': () => ({ body: cityTreeFixture }),
      'PUT /api/v1/addresses/31': (body) => ({ body: { ...addressFixture, ...(body as object) } }),
    });
    const { client } = await renderPage(<AddressEditPage />);
    const preview = routeQueryKey('order.checkoutPreview', {
      body: { source: 'buy-now', item: { skuId: '1', quantity: 1 }, kind: 'normal' },
    });
    client.setQueryData(preview, { cached: true });
    await screen.findByDisplayValue('李四');

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(taroFake.calls.some((c) => c.api === 'navigateBack')).toBe(true));
    expect(client.getQueryState(preview)?.isInvalidated).toBe(true);
  });

  it('says what is missing and sends nothing', async () => {
    const seen = serveApi({ 'GET /api/v1/cities': () => ({ body: cityTreeFixture }) });
    await renderPage(<AddressEditPage />);

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('请填写正确的手机号')).toBeTruthy();
    expect(screen.getByText('请选择所在地区')).toBeTruthy();
    expect(seen.some((r) => r.key === 'POST /api/v1/addresses')).toBe(false);
  });

  it('opens on an import the list handed over, asking only for the region', async () => {
    handOffImportedAddress({
      receiverName: '张三',
      receiverPhone: '13800138000',
      region: null,
      detail: '体育西路 100 号',
      postCode: null,
      isDefault: false,
    });
    serveApi({ 'GET /api/v1/cities': () => ({ body: cityTreeFixture }) });
    await renderPage(<AddressEditPage />);

    expect(screen.getByDisplayValue('张三')).toBeTruthy();
    expect(screen.getByText('请选择所在地区')).toBeTruthy();
    expect(taroFake.storage.has('shop.address.imported')).toBe(false);
  });
});
