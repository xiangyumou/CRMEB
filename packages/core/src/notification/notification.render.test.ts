import { describe, expect, it } from 'vitest';
import {
  clampField,
  formatShopTime,
  placeholdersIn,
  render,
  renderFields,
  toTemplateData,
  WECHAT_FIELD_LIMIT,
} from './notification.render';

describe('render', () => {
  const data = { orderNo: 'SO202602140001', amount: '99.00' };

  it('substitutes a placeholder', () => {
    expect(render('订单 {{orderNo}} 已支付 ¥{{amount}}', data)).toBe(
      '订单 SO202602140001 已支付 ¥99.00',
    );
  });

  it('accepts the spaces an operator leaves inside the braces', () => {
    expect(render('订单 {{ orderNo }}', data)).toBe('订单 SO202602140001');
  });

  it('renders an unknown placeholder as nothing, never as itself', () => {
    // A customer reading "您的订单 {{orderNo}} 已发货" learns the shop is broken.
    expect(render('您的订单 {{trackingNo}} 已发货', data)).toBe('您的订单  已发货');
  });

  it('leaves a single brace alone — stored wording may still use them', () => {
    expect(render('订单 {order_id}', data)).toBe('订单 {order_id}');
  });

  it('substitutes every occurrence, not just the first', () => {
    expect(render('{{orderNo}}/{{orderNo}}', data)).toBe('SO202602140001/SO202602140001');
  });

  it('does not re-render what a value itself contains', () => {
    // A product name containing `{{amount}}` must not be expanded, or a
    // customer-supplied string becomes a template injection.
    expect(render('{{orderNo}}', { orderNo: '{{amount}}', amount: '99.00' })).toBe('{{amount}}');
  });

  it('lists the placeholders a template uses, sorted and deduplicated', () => {
    expect(placeholdersIn('{{b}} {{a}} {{ b }}')).toEqual(['a', 'b']);
  });
});

describe('clampField', () => {
  it('leaves a field WeChat accepts untouched', () => {
    expect(clampField('短')).toBe('短');
    expect(clampField('x'.repeat(WECHAT_FIELD_LIMIT))).toHaveLength(WECHAT_FIELD_LIMIT);
  });

  it('truncates rather than letting WeChat reject the whole message', () => {
    const out = clampField('x'.repeat(WECHAT_FIELD_LIMIT + 50));
    expect(out).toHaveLength(WECHAT_FIELD_LIMIT);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('renderFields', () => {
  const data = { orderNo: 'SO1', amount: '99.00' };

  it('produces the `{ field: { value } }` shape the template APIs want', () => {
    expect(renderFields({ character_string2: '{{orderNo}}', amount5: '{{amount}}' }, data)).toEqual(
      {
        character_string2: { value: 'SO1' },
        amount5: { value: '99.00' },
      },
    );
  });

  it('drops a field that rendered empty instead of sending ""', () => {
    // WeChat type-checks each field and fails the *whole* message (47003) on an
    // empty one, so one missing variable would lose the entire notification.
    expect(renderFields({ thing3: '{{missing}}', character_string2: '{{orderNo}}' }, data)).toEqual(
      {
        character_string2: { value: 'SO1' },
      },
    );
  });

  it('clamps a long value, so one long product name cannot lose the message', () => {
    const out = renderFields({ thing3: '{{name}}' }, { name: 'x'.repeat(400) });
    expect(out['thing3']?.value).toHaveLength(WECHAT_FIELD_LIMIT);
  });

  it('is empty for a template with no field map at all', () => {
    expect(renderFields(undefined, data)).toEqual({});
  });
});

describe('toTemplateData', () => {
  it('stringifies the scalars a payload carries', () => {
    expect(toTemplateData({ a: 'x', b: 2, c: true, d: 10n })).toEqual({
      a: 'x',
      b: '2',
      c: 'true',
      d: '10',
    });
  });

  it('turns null and undefined into the empty string, so the placeholder vanishes', () => {
    expect(toTemplateData({ a: null, b: undefined })).toEqual({ a: '', b: '' });
  });

  it('drops anything structured rather than printing [object Object]', () => {
    expect(toTemplateData({ a: { nested: 1 }, b: [1, 2], c: 'kept' })).toEqual({ c: 'kept' });
  });

  it('survives a payload that is not an object', () => {
    expect(toTemplateData(null)).toEqual({});
    expect(toTemplateData('string')).toEqual({});
  });
});

describe('formatShopTime', () => {
  it('reads an instant on the shop calendar, not the UTC one', () => {
    const lateUtc = new Date('2026-06-01T16:30:00.000Z');
    expect(formatShopTime(lateUtc, 'day')).toBe('2026-06-02');
    expect(formatShopTime(lateUtc, 'minute')).toBe('2026-06-02 00:30');
  });
});
