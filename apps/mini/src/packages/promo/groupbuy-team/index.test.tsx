import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ResponseOf } from '@shop/api-client';
import { useCheckoutDraft } from '@/features/checkout/draft';
import type { TeamView } from '@/features/groupbuy/team';
import { useSession } from '@/session/session';
import { serveApi, type FakeReply } from '@/test/fake-api';
import { renderPage } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import GroupbuyTeamPage from './index';

const view = (patch: Partial<TeamView> = {}): TeamView => ({
  groupId: '501',
  activityId: '1',
  title: '双人团 · 护理套装',
  imageUrl: null,
  price: '59.00',
  status: 'forming',
  seatsTotal: 2,
  seatsTaken: 1,
  seatsLeft: 1,
  expiresAt: '2099-01-01T00:00:00Z',
  succeededAt: null,
  members: [{ userId: '101', nickname: '小明', avatarUrl: 'leader.png', role: 'leader' }],
  me: null,
  canJoin: true,
  ...patch,
});

const activity: ResponseOf<'groupbuy.detail'> = {
  activityId: '1',
  productId: '11',
  title: '双人团 · 护理套装',
  intro: null,
  imageUrl: null,
  price: '59.00',
  originalPrice: '88.00',
  seatsRequired: 2,
  stock: 20,
  sales: 3,
  startAt: '2020-01-01T00:00:00Z',
  endAt: '2099-01-01T00:00:00Z',
  formingGroups: 1,
  canBuy: true,
  sliderImages: [],
  groupTtlSeconds: 86400,
  perOrderQuantity: 1,
  description: null,
  skus: [
    {
      skuId: '21',
      specText: '标准',
      specValues: {},
      imageUrl: null,
      price: '59.00',
      originalPrice: '88.00',
      stock: 5,
    },
  ],
  myOpenGroupId: null,
};

function serve(team: TeamView | { reply: FakeReply }, after?: TeamView) {
  return serveApi({
    'GET /api/v1/groupbuy/groups/501': () => ('reply' in team ? team.reply : { body: team }),
    'GET /api/v1/groupbuy/activities/1': () => ({ body: activity }),
    'POST /api/v1/groupbuy/groups/501/withdrawal': () => ({ body: after }),
    'GET /api/v1/share/mini-codes': () => ({ body: { url: '/uploads/code.png' } }),
  });
}

const navigatedTo = () =>
  taroFake.calls
    .filter((call) => call.api === 'navigateTo')
    .map((call) => (call.args as { url: string }).url);

describe('拼团进度', () => {
  beforeEach(() => {
    taroFake.routerParams = { id: '501' };
    useSession.setState({ session: { status: 'signed-in', token: 't' } });
    useCheckoutDraft.setState({ draft: null });
  });

  it('shows an open team to a stranger by seats, never by name or face, and lets them join', async () => {
    serve(view());
    await renderPage(<GroupbuyTeamPage />);
    expect(await screen.findByText('还差 1 人成团')).toBeTruthy();
    expect(screen.getByText('团长')).toBeTruthy();
    expect(screen.getByText('待加入')).toBeTruthy();
    expect(screen.getByText(/到时间未凑齐将自动取消，已付款项原路退回/)).toBeTruthy();
    expect(screen.queryByText(/小明/)).toBeNull();
    expect(document.querySelectorAll('img[src="leader.png"]').length).toBe(0);

    const join = screen.getByRole('button', { name: '参与拼团' });
    await waitFor(() => expect(join.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(join);
    const confirm = await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: '参与拼团' });
      expect(buttons.length).toBe(2);
      return buttons[1]!;
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(navigatedTo().at(-1)).toBe('/packages/order/checkout/index'));
    expect(useCheckoutDraft.getState().draft).toEqual({
      source: 'buy-now',
      item: { skuId: '21', quantity: 1 },
      kind: 'groupbuy',
      kindMeta: { activityId: '1', groupId: '501' },
    });
  });

  it('asks a visitor to log in before joining', async () => {
    useSession.setState({ session: { status: 'phone-required', bindToken: 'b' } });
    serve(view());
    await renderPage(<GroupbuyTeamPage />);
    const join = await screen.findByRole('button', { name: '参与拼团' });
    await waitFor(() => expect(join.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(join);
    await waitFor(() => expect(navigatedTo()[0]).toMatch(/^\/pages\/login\/index\?redirect=/));
    expect(decodeURIComponent(navigatedTo()[0] ?? '')).toContain('"route":"groupbuyTeam"');
  });

  it('lets a paid member invite: WeChat share or a poster', async () => {
    const seen = serve(
      view({ me: { role: 'leader', status: 'joined', orderId: '70', paid: true }, canJoin: false }),
    );
    await renderPage(<GroupbuyTeamPage />);
    fireEvent.click(await screen.findByRole('button', { name: '邀请好友参团' }));
    expect(screen.getByRole('button', { name: '分享给好友' })).toBeTruthy();
    fireEvent.click(document.getElementById('share-poster')!);
    await waitFor(() =>
      expect(seen.find((r) => r.key === 'GET /api/v1/share/mini-codes')?.query).toEqual({
        route: 'groupbuyTeam',
        id: '501',
      }),
    );
    expect(taroFake.shareHandlers.message?.()).toEqual({
      title: '还差 1 人成团 · ¥59.00 双人团 · 护理套装',
      path: '/packages/promo/groupbuy-team/index?id=501',
    });
  });

  it('lets a leader nobody has paid into pay or withdraw', async () => {
    const unpaid = view({
      seatsTaken: 0,
      seatsLeft: 2,
      members: [],
      me: { role: 'leader', status: 'joined', orderId: '70', paid: false },
      canJoin: false,
    });
    const seen = serve(unpaid, { ...unpaid, status: 'cancelled', me: null });
    await renderPage(<GroupbuyTeamPage />);
    fireEvent.click(await screen.findByRole('button', { name: '去支付' }));
    expect(navigatedTo().at(-1)).toBe('/packages/order/cashier/index?orderId=70');
    fireEvent.click(screen.getByRole('button', { name: '取消拼团' }));
    await waitFor(() =>
      expect(seen.some((r) => r.key === 'POST /api/v1/groupbuy/groups/501/withdrawal')).toBe(true),
    );
  });

  it('says honestly that an unfilled team failed and the money is back', async () => {
    serve(
      view({
        status: 'failed',
        members: [],
        me: { role: 'leader', status: 'refunded', orderId: '70', paid: false },
        canJoin: false,
      }),
    );
    await renderPage(<GroupbuyTeamPage />);
    expect(await screen.findByText('拼团未成功，已退款')).toBeTruthy();
    expect(screen.getByText('款项已原路退回，请留意到账')).toBeTruthy();
    // Nobody is left in it: no seats, and no 待加入 to invite a stranger into.
    expect(screen.queryByText('待加入')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '查看订单' }));
    expect(navigatedTo().at(-1)).toBe('/packages/order/detail/index?id=70');
    fireEvent.click(screen.getByRole('button', { name: '再开一团' }));
    expect(navigatedTo().at(-1)).toBe('/packages/promo/groupbuy-detail/index?id=1');
  });

  it('shows a team past its deadline as settling, not open', async () => {
    serve(view({ expiresAt: '2021-01-01T00:00:00Z' }));
    await renderPage(<GroupbuyTeamPage />);
    expect(await screen.findByText('拼团时间已到，正在结算')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '参与拼团' })).toBeNull();
  });

  it('shows a full team as a success', async () => {
    serve(
      view({
        status: 'succeeded',
        seatsTaken: 2,
        seatsLeft: 0,
        me: { role: 'member', status: 'joined', orderId: '71', paid: true },
        canJoin: false,
      }),
    );
    await renderPage(<GroupbuyTeamPage />);
    expect(await screen.findByText('拼团成功')).toBeTruthy();
    expect(screen.getByText('商家将尽快为你发货')).toBeTruthy();
  });

  it('says a missing team does not exist', async () => {
    serve({
      reply: { status: 404, body: { code: 'GROUPBUY_GROUP_NOT_FOUND', message: '该团不存在' } },
    });
    await renderPage(<GroupbuyTeamPage />);
    expect(await screen.findByText('这个团不存在')).toBeTruthy();
  });
});
