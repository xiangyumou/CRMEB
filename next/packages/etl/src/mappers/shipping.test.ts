import { describe, expect, it } from 'vitest';
import {
  chargeModeOf,
  cityIdOf,
  mapShipping,
  type LegacyShippingFree,
  type LegacyShippingRegion,
  type LegacyShippingTemplate,
} from './shipping';

/** The one template `crmeb/public/install/crmeb.sql` ships with. */
const TEMPLATE: LegacyShippingTemplate = {
  id: 1,
  name: '默认模版',
  type: 1,
  appoint: 0,
  no_delivery: 0,
  sort: 0,
  add_time: 1658394592,
};

function region(overrides: Partial<LegacyShippingRegion> = {}): LegacyShippingRegion {
  return {
    id: 1,
    province_id: 0,
    temp_id: 1,
    city_id: 0,
    first: '1.00',
    first_price: '0.00',
    continue: '1.00',
    continue_price: '0.00',
    type: 1,
    uniqid: 'adminapi62d917e0ec6f35045',
    ...overrides,
  };
}

function free(overrides: Partial<LegacyShippingFree> = {}): LegacyShippingFree {
  return {
    id: 1,
    province_id: 0,
    temp_id: 1,
    city_id: 0,
    number: '0.00',
    price: '199.00',
    type: 1,
    uniqid: 'free-1',
    ...overrides,
  };
}

describe('templates', () => {
  it('maps the reference row', () => {
    const out = mapShipping({ templates: [TEMPLATE], regions: [region()] });
    expect(out.templates[0]).toEqual({
      id: 1,
      name: '默认模版',
      chargeMode: 'quantity',
      hasFreeRules: false,
      hasNoDeliveryRules: false,
      sortOrder: 0,
      createdAt: new Date(1658394592 * 1000),
      updatedAt: new Date(1658394592 * 1000),
      deletedAt: null,
    });
    expect(out.regions[0]).toMatchObject({ templateId: 1, isFallback: true, cityIds: [] });
  });

  it.each([
    [1, 'quantity'],
    [2, 'weight'],
    [3, 'volume'],
    [9, 'quantity'],
  ])('maps charge mode %i', (type, expected) => {
    expect(chargeModeOf(type)).toBe(expected);
  });
});

describe('regions', () => {
  it('collapses one uniqid group into one rule with its cities', () => {
    const out = mapShipping({
      templates: [TEMPLATE],
      regions: [
        region(),
        region({ id: 2, city_id: 330100, uniqid: 'g2', first_price: '12.00' }),
        region({ id: 3, city_id: 330200, uniqid: 'g2', first_price: '12.00' }),
        // A province-wide row leaves city_id at 0.
        region({ id: 4, province_id: 110000, uniqid: 'g2' }),
      ],
    });
    expect(out.regions).toHaveLength(2);
    expect(out.regions[1]).toMatchObject({
      isFallback: false,
      firstPrice: '12.00',
      cityIds: [330100, 330200, 110000],
    });
  });

  it('falls back on the row id when uniqid is empty', () => {
    const out = mapShipping({
      templates: [TEMPLATE],
      regions: [
        region({ id: 2, city_id: 330100, uniqid: '' }),
        region({ id: 3, city_id: 330200, uniqid: '' }),
      ],
    });
    // Two ungrouped rows are two rules, not one rule covering both cities.
    expect(out.regions.filter((row) => !row.isFallback)).toHaveLength(2);
  });

  it('synthesises a zero-cost fallback for a template that has none', () => {
    const out = mapShipping({
      templates: [TEMPLATE],
      regions: [region({ id: 2, city_id: 330100, uniqid: 'g2' })],
    });
    const fallback = out.regions.find((row) => row.isFallback);
    expect(fallback).toMatchObject({ firstPrice: '0.00', additionalPrice: '0.00', cityIds: [] });
    expect(out.report.templatesFallbackSynthesised).toBe(1);
  });

  it('keeps one fallback per template, because the partial index allows one', () => {
    const out = mapShipping({
      templates: [TEMPLATE],
      regions: [region(), region({ id: 2, uniqid: 'other', first_price: '99.00' })],
    });
    expect(out.regions.filter((row) => row.isFallback)).toHaveLength(1);
    expect(out.report.templatesFallbackDuplicated).toBe(1);
  });

  it('drops a child row whose template is gone', () => {
    const out = mapShipping({ templates: [TEMPLATE], regions: [region({ temp_id: 404 })] });
    expect(out.report.orphanedChildRows).toBe(1);
  });
});

describe('free rules', () => {
  it('reads 0.00 as "not used" rather than "free above nothing"', () => {
    const out = mapShipping({ templates: [TEMPLATE], free: [free()] });
    expect(out.freeRules[0]).toMatchObject({ minUnits: null, minAmount: '199.00' });
  });

  it('drops a rule with no threshold at all', () => {
    const out = mapShipping({
      templates: [TEMPLATE],
      free: [free({ number: '0.00', price: '0.00' })],
    });
    expect(out.freeRules).toEqual([]);
    expect(out.report.freeRulesWithoutThreshold).toBe(1);
  });
});

describe('no-delivery cities', () => {
  it('de-duplicates the composite key and ignores a city-less row', () => {
    const out = mapShipping({
      templates: [TEMPLATE],
      noDelivery: [
        { id: 1, province_id: 0, temp_id: 1, city_id: 620000, uniqid: 'n' },
        { id: 2, province_id: 0, temp_id: 1, city_id: 620000, uniqid: 'n' },
        { id: 3, province_id: 0, temp_id: 1, city_id: 0, uniqid: 'n' },
      ],
    });
    expect(out.noDeliveryCities).toEqual([{ templateId: 1, cityId: 620000 }]);
  });
});

describe('express companies', () => {
  it('emits the two columns an operator can change', () => {
    const out = mapShipping({
      express: [
        { id: 1, code: 'yunda', name: '韵达快递', sort: 5, is_show: 1, status: 0 },
        { id: 2, code: 'shunfeng', name: '顺丰速运', sort: 0, is_show: 0, status: 1 },
      ],
    });
    expect(out.expressCompanies).toEqual([
      { id: 1, code: 'yunda', name: '韵达快递', sortOrder: 5, isEnabled: true },
      { id: 2, code: 'shunfeng', name: '顺丰速运', sortOrder: 0, isEnabled: false },
    ]);
    expect(out.report.expressCompaniesDisabled).toBe(1);
  });
});

describe('helpers', () => {
  it('reads the narrowest division the row names', () => {
    expect(cityIdOf({ province_id: 330000, city_id: 330100 })).toBe(330100);
    expect(cityIdOf({ province_id: 330000, city_id: 0 })).toBe(330000);
    expect(cityIdOf({ province_id: 0, city_id: 0 })).toBeNull();
  });
});
