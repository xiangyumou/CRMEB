import { describe, expect, it } from 'vitest';
import { setWebviewDomains } from '@/platform';
import { taroFake } from '@/test/taro-fake/taro';
import { openLinkTarget } from './open-link';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('openLinkTarget', () => {
  it('opens catalogue kinds through the route catalogue', async () => {
    openLinkTarget({ kind: 'product', id: '12' });
    openLinkTarget({ kind: 'category', id: '3' });
    openLinkTarget({ kind: 'page', id: '7' });
    openLinkTarget({ kind: 'route', to: { route: 'cart', params: {} } });
    await settle();
    expect(taroFake.calls.map((call) => [call.api, call.args])).toEqual([
      ['navigateTo', { url: '/pages/product/index?id=12' }],
      ['navigateTo', { url: '/packages/goods/list/index?categoryId=3' }],
      ['navigateTo', { url: '/packages/page/index?id=7' }],
      ['switchTab', { url: '/pages/cart/index' }],
    ]);
  });

  it('opens an allowed web page in the web-view and copies any other', async () => {
    setWebviewDomains(['shop.example.com']);
    openLinkTarget({ kind: 'webview', url: 'https://shop.example.com/a' });
    openLinkTarget({ kind: 'webview', url: 'https://elsewhere.example.com/b' });
    await settle();
    expect(taroFake.calls[0]).toEqual({
      api: 'navigateTo',
      args: { url: '/packages/content/webview/index?url=https%3A%2F%2Fshop.example.com%2Fa' },
    });
    expect(taroFake.calls.some((call) => call.api === 'setClipboardData')).toBe(true);
    setWebviewDomains([]);
  });

  it('asks WeChat to open another mini-program', () => {
    openLinkTarget({ kind: 'miniprogram', appId: 'wx0123456789abcdef', path: 'pages/a' });
    expect(taroFake.calls).toContainEqual({
      api: 'navigateToMiniProgram',
      args: { appId: 'wx0123456789abcdef', path: 'pages/a' },
    });
  });
});
