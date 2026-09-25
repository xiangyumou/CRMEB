import { describe, expect, it } from 'vitest';

import { adminProductForm } from './schemas';

const base = {
  name: '话费充值卡',
  kind: 'virtual_card',
  status: 'on_shelf',
  imageUrl: 'https://example.test/p.png',
  sliderImages: [],
  displaySalesBoost: 0,
  specMode: false,
  specs: [],
  freightMode: 'free',
  purchaseLimitMode: 'none',
  minPurchaseQuantity: 1,
  sortOrder: 0,
  descriptionHtml: '',
  categoryIds: ['1'],
};

const sku = { specValues: {}, price: '30.00', isDefault: true, isVisible: true, sortOrder: 0 };

describe('a 卡密 product in the editor', () => {
  it('accepts the pool the editor was shown, echoed back as stock', () => {
    const parsed = adminProductForm.safeParse({
      ...base,
      skus: [{ ...sku, stock: 3, expectedStock: 3 }],
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses a stock the operator typed', () => {
    const typed = adminProductForm.safeParse({
      ...base,
      skus: [{ ...sku, stock: 5, expectedStock: 3 }],
    });
    expect(typed.success).toBe(false);
    const fresh = adminProductForm.safeParse({ ...base, skus: [{ ...sku, stock: 5 }] });
    expect(fresh.success).toBe(false);
    expect(fresh.error?.issues[0]?.message).toContain('卡密');
  });
});
