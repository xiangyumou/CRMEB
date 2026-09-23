import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { startSession, useSession } from '@/session/session';
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

describe('首页 (tab shell)', () => {
  beforeEach(() => useSession.setState({ session: { status: 'idle' } }));

  it('puts a signed-in shopper’s cart count on the cart tab and styles the tab bar', async () => {
    taroFake.storage.set('shop.session.token', 't1');
    serveApi({ 'GET /api/v1/cart/count': () => ({ body: count(3) }) });
    await startSession();

    await renderPage(<Home />);

    expect(screen.getByText('建设中')).toBeTruthy();
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
    const seen = serveApi({});

    await renderPage(<Home />);

    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({ api: 'removeTabBarBadge', args: { index: 2 } }),
    );
    expect(seen.filter((request) => request.key.includes('/cart/'))).toHaveLength(0);
  });
});
