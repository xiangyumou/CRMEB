import type { OrderListItem } from '@shop/contracts/order/schemas';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { taroFake } from '@/test/taro-fake/taro';
import { orderActions, orderStatusText } from './order-actions';
import { OrderCard } from './order-card';

const item = (id: string) => ({
  id,
  itemKey: `sku-${id}`,
  productId: '11',
  skuId: '21',
  productName: `商品 ${id}`,
  productImageUrl: '/p.jpg',
  productKind: 'physical' as const,
  specText: '混合装|1000g',
  skuImageUrl: null,
  unitName: '盒',
  quantity: 1,
  unitPrice: '60.00',
  originalUnitPrice: null,
  discountAmount: '0.00',
  totalAmount: '60.00',
  refundedQuantity: 0,
  shippedQuantity: 0,
  adjustments: [],
});

const order: OrderListItem = {
  id: '9001',
  orderNo: '202602011000000010123456',
  kind: 'normal',
  status: 'shipped',
  fulfillmentStatus: 'fulfilled',
  refundStatus: 'none',
  totalQuantity: 4,
  itemsAmount: '240.00',
  freightAmount: '0.00',
  couponDiscount: '0.00',
  payableAmount: '240.00',
  paidAmount: '240.00',
  payExpiresAt: null,
  createdAt: '2026-02-01T10:00:00+08:00',
  items: [item('1'), item('2'), item('3'), item('4')],
};

const keys = (o: Partial<OrderListItem>) =>
  orderActions({ ...order, ...o }).map((action) => action.key);

describe('orderActions', () => {
  it('gives each status its buttons, the primary one last', () => {
    expect(keys({ status: 'pending_payment' })).toEqual(['cancel', 'pay']);
    expect(keys({ status: 'paid', fulfillmentStatus: 'unfulfilled' })).toEqual(['aftersale']);
    expect(keys({ status: 'paid', fulfillmentStatus: 'partially_fulfilled' })).toEqual([
      'aftersale',
      'logistics',
    ]);
    expect(keys({ status: 'shipped' })).toEqual(['aftersale', 'logistics', 'confirm']);
    expect(keys({ status: 'received' })).toEqual(['aftersale', 'rebuy', 'review']);
    expect(keys({ status: 'completed' })).toEqual(['delete', 'rebuy']);
    expect(keys({ status: 'cancelled' })).toEqual(['delete', 'rebuy']);
    expect(keys({ status: 'cancelled', kind: 'groupbuy' })).toEqual(['delete']);
    expect(orderActions({ ...order, status: 'pending_payment' }).at(-1)?.variant).toBe('primary');
  });

  it('holds 申请售后 back while one is open', () => {
    expect(keys({ status: 'shipped', refundStatus: 'requested' })).toEqual([
      'logistics',
      'confirm',
    ]);
  });

  it('names the status the way the tabs do', () => {
    expect(
      orderStatusText({ ...order, status: 'paid', fulfillmentStatus: 'partially_fulfilled' }),
    ).toBe('部分发货');
    expect(orderStatusText({ ...order, status: 'received' })).toBe('待评价');
  });
});

describe('OrderCard', () => {
  it('shows three lines, the rest counted, the amount paid and the actions', () => {
    const onAction = vi.fn();
    render(<OrderCard order={order} onAction={onAction} />);
    expect(screen.getByText('待收货')).toBeTruthy();
    expect(screen.getByText('商品 3')).toBeTruthy();
    expect(screen.queryByText('商品 4')).toBeNull();
    expect(screen.getByText('还有 1 种商品')).toBeTruthy();
    expect(screen.getByText('共 4 件')).toBeTruthy();
    expect(screen.getByText('实付')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认收货' }));
    expect(onAction).toHaveBeenCalledWith('confirm', order);
  });

  it('opens the order', async () => {
    render(<OrderCard order={order} onAction={() => undefined} />);
    fireEvent.click(screen.getByRole('link', { name: `订单 ${order.orderNo}，待收货` }));
    await vi.waitFor(() =>
      expect(taroFake.calls).toContainEqual({
        api: 'navigateTo',
        args: { url: '/packages/order/detail/index?id=9001' },
      }),
    );
  });

  it('counts an unpaid order down and spins the action in flight', () => {
    render(
      <OrderCard
        order={{
          ...order,
          status: 'pending_payment',
          paidAmount: null,
          payExpiresAt: '2999-01-01T00:00:00+08:00',
        }}
        onAction={() => undefined}
        busy="pay"
      />,
    );
    expect(screen.getByText('应付')).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByRole('button', { name: '立即付款' }).className).toContain(
      'shop-btn--loading',
    );
  });

  it('tags a group-buy order and says 售后中 while a refund is open', () => {
    render(
      <OrderCard
        order={{ ...order, kind: 'groupbuy', refundStatus: 'requested' }}
        onAction={() => undefined}
      />,
    );
    expect(screen.getByText('拼团')).toBeTruthy();
    expect(screen.getByText('售后中')).toBeTruthy();
  });
});
