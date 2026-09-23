import { fireEvent, screen } from '@testing-library/dom';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fixtureCarousel,
  fixtureOrderEntry,
  fixturePersonal,
  fixtureServiceGrid,
  fixtureUserCard,
} from '../fixtures';
import { cleanup, render } from '../test/render';
import { BlockList, OrderEntry, orderEntryLink, ServiceGrid, UserCard } from './index';
import orderStyles from './order-entry/order-entry.module.scss';

afterEach(cleanup);

/**
 * The 个人中心 blocks, through the DOM shim, on React 19 and React 18. Their
 * per-shopper state arrives as `personal` (DECOR-015); a guest has none.
 */

const route = (to: string, params: Record<string, string> = {}) => ({
  kind: 'route',
  to: { route: to, params },
});

describe('UserCard', () => {
  it('shows the signed-in shopper and their totals, each linking to its page', () => {
    const onLink = vi.fn();
    render(
      <UserCard props={fixtureUserCard} personal={fixturePersonal.userCard} onLink={onLink} />,
    );
    expect(screen.getByText('小林')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('28')).toBeTruthy();
    fireEvent.click(screen.getByText('小林'));
    expect(onLink).toHaveBeenLastCalledWith(route('profile'));
    fireEvent.click(screen.getByText('足迹'));
    expect(onLink).toHaveBeenLastCalledWith(route('history'));
  });

  it('asks a guest to sign in, through the login intent, with no numbers', () => {
    const onIntent = vi.fn();
    const onLink = vi.fn();
    render(<UserCard props={fixtureUserCard} onIntent={onIntent} onLink={onLink} />);
    expect(screen.getAllByText('-')).toHaveLength(3);
    fireEvent.click(screen.getByText('登录 / 注册'));
    expect(onIntent).toHaveBeenCalledWith({ kind: 'login' });
    expect(onLink).not.toHaveBeenCalled();
  });

  it('names a shopper without a nickname, and hides the totals when turned off', () => {
    render(
      <UserCard
        props={{ ...fixtureUserCard, showStats: false }}
        personal={{
          user: { kind: 'userSummary', user: { nickname: null, avatarUrl: null, stats: null } },
        }}
      />,
    );
    expect(screen.getByText('微信用户')).toBeTruthy();
    expect(screen.queryByText('优惠券')).toBeNull();
  });
});

describe('OrderEntry', () => {
  it('badges each status with the shopper’s count: none for 0, 99+ past 99', () => {
    const { container } = render(
      <OrderEntry props={fixtureOrderEntry} personal={fixturePersonal.orderEntry} />,
    );
    const badges = [...container.querySelectorAll(`.${orderStyles.badge as string}`)].map(
      (badge) => badge.textContent,
    );
    // unpaid 1, unshipped 2, unreceived 0, unreviewed (not counted), aftersale 120.
    expect(badges).toEqual(['1', '2', '99+']);
  });

  it('shows no badge to a guest', () => {
    const { container } = render(<OrderEntry props={fixtureOrderEntry} />);
    expect(container.querySelector(`.${orderStyles.badge as string}`)).toBeNull();
    expect(screen.getByText('待付款')).toBeTruthy();
  });

  it('opens the order list on the entry’s tab, and 全部订单 on none', () => {
    const onLink = vi.fn();
    render(<OrderEntry props={fixtureOrderEntry} onLink={onLink} />);
    fireEvent.click(screen.getByText('待发货'));
    expect(onLink).toHaveBeenLastCalledWith(route('orderList', { tab: 'unshipped' }));
    fireEvent.click(screen.getByText('售后/退款'));
    expect(onLink).toHaveBeenLastCalledWith(route('refundList'));
    fireEvent.click(screen.getByText('全部订单'));
    expect(onLink).toHaveBeenLastCalledWith(route('orderList'));
    expect(orderEntryLink('unreviewed')).toEqual(route('myReviews'));
  });
});

describe('ServiceGrid', () => {
  it('links a link entry and asks for contact on 联系客服', () => {
    const onLink = vi.fn();
    const onIntent = vi.fn();
    render(<ServiceGrid props={fixtureServiceGrid} onLink={onLink} onIntent={onIntent} />);
    fireEvent.click(screen.getByText('收货地址'));
    expect(onLink).toHaveBeenCalledWith(route('addresses'));
    fireEvent.click(screen.getByText('联系客服'));
    expect(onIntent).toHaveBeenCalledWith({ kind: 'contact' });
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('lets the host wrap the contact entry in its own control, and then adds no tap', () => {
    const onIntent = vi.fn();
    const renderIntent = vi.fn((intent: { kind: string }, children: ReactNode) => (
      <button type="button" data-host-intent={intent.kind}>
        {children}
      </button>
    ));
    const { container } = render(
      <ServiceGrid props={fixtureServiceGrid} onIntent={onIntent} renderIntent={renderIntent} />,
    );
    const button = container.querySelector('[data-intent="contact"] button');
    expect(button?.getAttribute('data-host-intent')).toBe('contact');
    expect(button?.textContent).toContain('联系客服');
    fireEvent.click(button as Element);
    expect(onIntent).not.toHaveBeenCalled();
    expect(renderIntent).toHaveBeenCalledTimes(1);
  });

  it('draws the label’s first character when an entry has no icon', () => {
    render(<ServiceGrid props={fixtureServiceGrid} />);
    expect(screen.getByText('联')).toBeTruthy();
  });
});

describe('BlockList with per-shopper state', () => {
  it('hands each block its own personal slots and the intent handlers', () => {
    const onIntent = vi.fn();
    const { container } = render(
      <BlockList
        blocks={[
          { id: 'u', type: 'userCard', props: fixtureUserCard },
          { id: 'o', type: 'orderEntry', props: fixtureOrderEntry },
          { id: 's', type: 'serviceGrid', props: fixtureServiceGrid },
          { id: 'c', type: 'carousel', props: fixtureCarousel },
        ]}
        personal={{ u: fixturePersonal.userCard, o: fixturePersonal.orderEntry }}
        onIntent={onIntent}
      />,
    );
    expect(screen.getByText('小林')).toBeTruthy();
    expect(container.querySelectorAll(`.${orderStyles.badge as string}`)).toHaveLength(3);
    fireEvent.click(screen.getByText('联系客服'));
    expect(onIntent).toHaveBeenCalledWith({ kind: 'contact' });
  });

  it('renders a guest page with no personal state at all', () => {
    render(
      <BlockList
        blocks={[{ id: 'u', type: 'userCard', props: fixtureUserCard }]}
        personal={null}
      />,
    );
    expect(screen.getByText('登录 / 注册')).toBeTruthy();
  });
});
