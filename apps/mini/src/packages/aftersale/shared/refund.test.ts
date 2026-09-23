import { describe, expect, it } from 'vitest';
import { refundableItem, refundListItem } from '@/test/order-fixtures';
import { awaitsReturn, fromCents, lineEstimate, refundStatusText, toCents } from './refund';

describe('refund helpers', () => {
  it('turns money strings into cents and back', () => {
    expect(toCents('12.3')).toBe(1230);
    expect(toCents('0.05')).toBe(5);
    expect(toCents('100')).toBe(10000);
    expect(fromCents(1230)).toBe('12.30');
    expect(fromCents(5)).toBe('0.05');
  });

  it('estimates a line: all of it for every unit, a share rounded down for some', () => {
    const item = refundableItem('1', { refundableQuantity: 3, refundableAmount: '100.00' });
    expect(lineEstimate(item, 3)).toBe(10000);
    expect(lineEstimate(item, 1)).toBe(3333);
    expect(lineEstimate(item, 0)).toBe(0);
  });

  it('says where a return stands', () => {
    const r = refundListItem({ kind: 'return_and_refund', status: 'approved' });
    expect(refundStatusText({ ...r, returnStage: 'awaiting_shipment' })).toBe('待寄回商品');
    expect(refundStatusText({ ...r, returnStage: 'shipped_back' })).toBe('待商家收货');
    expect(awaitsReturn({ ...r, returnStage: 'awaiting_shipment' })).toBe(true);
    expect(awaitsReturn({ ...r, returnStage: 'shipped_back' })).toBe(false);
    expect(refundStatusText(refundListItem({ status: 'succeeded' }))).toBe('退款成功');
  });
});
