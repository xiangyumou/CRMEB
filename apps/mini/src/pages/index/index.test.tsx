import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppConfigStore } from '@/app-config';
import { startSession, useSession } from '@/session/session';
import { appConfigFixture } from '@/test/app-config-fixture';
import { resolvedPageFixture } from '@/test/decor-fixture';
import { serveApi } from '@/test/fake-api';
import { renderPage } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import Home from './index';

const count = (items: number) => ({
  items,
  quantity: items,
  availableCount: items,
  unavailableCount: 0,
});

const visits = { 'POST /api/v1/visits': () => ({ status: 204, body: null }) };

describe('首页', () => {
  beforeEach(() => {
    useSession.setState({ session: { status: 'idle' } });
    useAppConfigStore.setState({ config: appConfigFixture, source: 'network' });
  });

  it('puts a signed-in shopper’s cart count on the cart tab and styles the tab bar', async () => {
    taroFake.storage.set('shop.session.token', 't1');
    serveApi({
      ...visits,
      'GET /api/v1/cart/count': () => ({ body: count(3) }),
      'GET /api/v1/pages/home': () => ({ body: resolvedPageFixture() }),
    });
    await startSession();

    await renderPage(<Home />);

    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({
        api: 'setTabBarBadge',
        args: { index: 2, text: '3' },
      }),
    );
    expect(taroFake.calls.some((call) => call.api === 'setTabBarStyle')).toBe(true);
    expect(taroFake.calls.filter((call) => call.api === 'setTabBarItem')).toHaveLength(4);
  });

  it('asks for no cart count while signed out, and shows no badge', async () => {
    const seen = serveApi({
      ...visits,
      'GET /api/v1/pages/home': () => ({ body: resolvedPageFixture() }),
    });

    await renderPage(<Home />);

    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({ api: 'removeTabBarBadge', args: { index: 2 } }),
    );
    expect(seen.filter((request) => request.key.includes('/cart/'))).toHaveLength(0);
  });

  it('renders the designated page’s blocks, skips an unknown one and opens a product', async () => {
    serveApi({ ...visits, 'GET /api/v1/pages/home': () => ({ body: resolvedPageFixture() }) });

    await renderPage(<Home />);

    const product = await screen.findByText('柔雾丝绒礼盒');
    expect(screen.getByText('温感按摩油')).toBeTruthy();
    expect(screen.queryByText('未来的块')).toBeNull();
    fireEvent.click(product);
    expect(taroFake.calls).toContainEqual({
      api: 'navigateTo',
      args: { url: '/pages/product/index?id=12' },
    });
  });

  it('says the home page is being set up when none is designated', async () => {
    serveApi({
      ...visits,
      'GET /api/v1/pages/home': () => ({
        status: 404,
        body: { code: 'DECOR_HOME_NOT_SET', message: '尚未设置首页' },
      }),
    });

    await renderPage(<Home />);

    expect(await screen.findByText('店铺首页正在布置')).toBeTruthy();
    fireEvent.click(screen.getByText('去逛逛'));
    expect(taroFake.calls).toContainEqual({
      api: 'switchTab',
      args: { url: '/pages/category/index' },
    });
  });

  it('refreshes on pull-down and shares the page’s own title', async () => {
    let served = 0;
    serveApi({
      ...visits,
      'GET /api/v1/pages/home': () => {
        served += 1;
        return { body: resolvedPageFixture() };
      },
    });

    await renderPage(<Home />);
    await screen.findByText('柔雾丝绒礼盒');
    taroFake.pullDown();

    await waitFor(() => expect(served).toBe(2));
    await waitFor(() =>
      expect(taroFake.calls.some((call) => call.api === 'stopPullDownRefresh')).toBe(true),
    );
    expect(taroFake.shareHandlers.message?.()).toMatchObject({
      title: '首页好物',
      path: '/pages/index/index',
    });
  });

  it('records the visit', async () => {
    const seen = serveApi({
      ...visits,
      'GET /api/v1/pages/home': () => ({ body: resolvedPageFixture() }),
    });

    await renderPage(<Home />);

    await waitFor(() =>
      expect(seen.find((request) => request.key === 'POST /api/v1/visits')?.body).toEqual({
        path: '/pages/index/index',
      }),
    );
  });

  describe('开屏浮层', () => {
    const withSplash = {
      ...appConfigFixture,
      splashAd: {
        enabled: true,
        imageUrl: '/uploads/splash.png',
        link: { kind: 'product' as const, id: '12' },
        seconds: 3,
      },
    };

    it('shows once a day, and a tap on the picture opens its link', async () => {
      useAppConfigStore.setState({ config: withSplash, source: 'network' });
      serveApi({ ...visits, 'GET /api/v1/pages/home': () => ({ body: resolvedPageFixture() }) });

      const first = await renderPage(<Home />);
      expect(await screen.findByText('跳过 3')).toBeTruthy();
      fireEvent.click(screen.getByLabelText('查看活动'));
      expect(screen.queryByText('跳过 3')).toBeNull();
      expect(taroFake.calls).toContainEqual({
        api: 'navigateTo',
        args: { url: '/pages/product/index?id=12' },
      });
      first.unmount();

      await renderPage(<Home />);
      await screen.findByText('柔雾丝绒礼盒');
      expect(screen.queryByText(/^跳过/)).toBeNull();
    });

    it('closes on 跳过', async () => {
      useAppConfigStore.setState({ config: withSplash, source: 'network' });
      serveApi({ ...visits, 'GET /api/v1/pages/home': () => ({ body: resolvedPageFixture() }) });

      await renderPage(<Home />);
      fireEvent.click(await screen.findByText('跳过 3'));

      expect(screen.queryByText('跳过 3')).toBeNull();
    });
  });
});
