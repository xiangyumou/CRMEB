import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdminProductDetail } from '@shop/contracts/catalog/schemas';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity, zhName } from '@/test/render';

import { ProductEditorPage, formValuesOf } from './product-editor';

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const detail: AdminProductDetail = {
  id: '1',
  name: '简约白 T 恤',
  subtitle: null,
  spu: null,
  kind: 'physical',
  status: 'on_shelf',
  imageUrl: 'https://cdn.example.com/t.png',
  price: '39.00',
  originalPrice: null,
  cost: null,
  stock: 10,
  sales: 3,
  displaySalesBoost: 0,
  views: 12,
  specMode: true,
  isHot: false,
  isNew: false,
  isBest: false,
  isBenefit: false,
  isRecommended: false,
  sortOrder: 0,
  categoryIds: ['17'],
  categoryNames: ['男装'],
  labels: [],
  createdAt: '2026-06-01T10:00:00+08:00',
  updatedAt: '2026-06-01T10:00:00+08:00',
  deletedAt: null,
  keyword: null,
  barCode: null,
  cardImageUrl: null,
  sliderImages: [],
  videoUrl: null,
  unitName: '件',
  freightMode: 'template',
  fixedFreight: null,
  shippingTemplateId: '3',
  purchaseLimitMode: 'none',
  purchaseLimitQuantity: null,
  minPurchaseQuantity: 1,
  customForm: [{ key: 'engraving', label: '刻字内容', type: 'text', required: false }],
  descriptionHtml: '<p>纯棉</p>',
  specs: [
    {
      id: '900',
      name: '尺码',
      sortOrder: 0,
      values: [
        { id: '9001', value: 'M', imageUrl: null, sortOrder: 0 },
        { id: '9002', value: 'XL', imageUrl: null, sortOrder: 1 },
      ],
    },
  ],
  skus: [
    {
      id: '1100',
      skuCode: 'TS-001-M',
      specText: 'M',
      specValues: { 尺码: 'M' },
      imageUrl: null,
      price: '39.00',
      originalPrice: null,
      cost: null,
      stock: 6,
      sales: 2,
      barCode: null,
      weight: null,
      volume: null,
      isDefault: true,
      isVisible: true,
      sortOrder: 0,
    },
    {
      id: '1101',
      skuCode: 'TS-001-XL',
      specText: 'XL',
      specValues: { 尺码: 'XL' },
      imageUrl: null,
      price: '42.00',
      originalPrice: null,
      cost: null,
      stock: 4,
      sales: 1,
      barCode: null,
      weight: null,
      volume: null,
      isDefault: false,
      isVisible: true,
      sortOrder: 1,
    },
  ],
  params: [{ id: '70', name: '材质', value: '纯棉', templateId: '5' }],
  protectionIds: [],
  labelIds: [],
  recommendedProductIds: [],
  giftCouponIds: [],
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
      const payload = url.includes('/category-tree')
        ? { items: [] }
        : url.includes('/labels') ||
            url.includes('/protections') ||
            url.includes('/param-templates')
          ? { items: [], total: 0, page: 1, pageSize: 200 }
          : detail;
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

const editor = { ...testIdentity, permissions: ['catalog:product:read', 'catalog:product:write'] };

describe('商品编辑器', () => {
  it('turns the detail response into form input without a single null', () => {
    const values = formValuesOf(detail);

    // `exactOptionalPropertyTypes`: an optional field is absent or real.
    expect('subtitle' in values).toBe(false);
    expect('fixedFreight' in values).toBe(false);
    expect('purchaseLimitQuantity' in values).toBe(false);
    expect(values.shippingTemplateId).toBe('3');

    // `specValues` is the SKU's identity — the server matches an incoming row
    // to an existing SKU by it, which is how editing a price leaves the stock
    // and the sales counter alone.
    expect(values.skus?.[1]).toMatchObject({
      specValues: { 尺码: 'XL' },
      skuCode: 'TS-001-XL',
      price: '42.00',
      stock: 4,
    });
    expect(values.skus?.[1]).not.toHaveProperty('sales');
    expect(values.params?.[0]).toEqual({
      name: '材质',
      value: '纯棉',
      templateId: '5',
      sortOrder: 0,
    });
  });

  it('loads a product into the form and saves it back through PUT', async () => {
    const calls = stubApi();
    renderAdmin(<ProductEditorPage productId="1" />, { identity: editor });

    await waitFor(() => expect(screen.getByLabelText('商品名称')).toHaveValue('简约白 T 恤'));
    // The matrix renders one row per existing combination.
    expect(screen.getByLabelText('库存 1')).toHaveValue('6');
    expect(screen.getByLabelText('库存 2')).toHaveValue('4');

    await userEvent.click(screen.getByRole('button', { name: zhName('保存') }));

    await waitFor(() => {
      const save = calls.find((call) => call.method === 'PUT');
      expect(save?.url).toContain('/admin-api/catalog/products/1');
      const body = save?.body as Record<string, unknown>;
      expect(body.name).toBe('简约白 T 恤');
      expect(body.skus).toHaveLength(2);
      // No editor for the checkout form yet, so it is carried across rather
      // than silently dropped on the next save.
      expect(body.customForm).toEqual(detail.customForm);
      // A template product must not also carry a fixed freight.
      expect(body.fixedFreight).toBeUndefined();
    });
  });
});
