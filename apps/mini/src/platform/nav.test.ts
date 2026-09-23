import { describe, expect, it } from 'vitest';
import { taroFake } from '@/test/taro-fake/taro';
import {
  goBack,
  navigate,
  parseLoginRedirect,
  readRouteParams,
  routeKeyOfPath,
  takeTabParams,
  toPath,
} from './nav';

const lastCall = () => taroFake.calls.at(-1);

describe('toPath', () => {
  it('builds the page path with the known params, sorted and encoded', () => {
    expect(toPath({ route: 'payResult', params: { outTradeNo: 'P9', orderId: '9' } })).toBe(
      '/packages/order/pay-result/index?orderId=9&outTradeNo=P9',
    );
    expect(toPath({ route: 'search', params: { keyword: '坚果 礼盒' } })).toBe(
      '/packages/goods/search/index?keyword=%E5%9D%9A%E6%9E%9C%20%E7%A4%BC%E7%9B%92',
    );
    expect(toPath({ route: 'product', params: { id: '1', stray: 'x' } as never })).toBe(
      '/pages/product/index?id=1',
    );
  });

  it('opens home for a key it does not know', () => {
    expect(toPath({ route: 'no-such-page' })).toBe('/pages/index/index');
  });
});

describe('navigate', () => {
  it('pushes a page, or replaces it on request and when the stack is full', async () => {
    await navigate({ route: 'product', params: { id: '1' } });
    expect(lastCall()).toEqual({ api: 'navigateTo', args: { url: '/pages/product/index?id=1' } });
    await navigate({ route: 'product', params: { id: '2' } }, { replace: true });
    expect(lastCall()?.api).toBe('redirectTo');
    taroFake.pageStackDepth = 10;
    await navigate({ route: 'product', params: { id: '3' } });
    expect(lastCall()?.api).toBe('redirectTo');
  });

  it('switches to a tab and hands it the params once', async () => {
    await navigate({ route: 'category', params: { categoryId: '7' } });
    expect(lastCall()).toEqual({ api: 'switchTab', args: { url: '/pages/category/index' } });
    expect(readRouteParams('category', {})).toEqual({ categoryId: '7' });
    expect(takeTabParams('category')).toEqual({});
  });

  it('sends an unknown key home', async () => {
    await navigate({ route: 'staff-orders' });
    expect(lastCall()).toEqual({ api: 'switchTab', args: { url: '/pages/index/index' } });
  });

  it('goes back, or home when there is nothing behind', async () => {
    taroFake.pageStackDepth = 2;
    await goBack();
    expect(lastCall()?.api).toBe('navigateBack');
    taroFake.pageStackDepth = 1;
    await goBack();
    expect(lastCall()?.api).toBe('switchTab');
  });
});

describe('readRouteParams', () => {
  it('keeps only the declared params and decodes them', () => {
    expect(readRouteParams('search', { keyword: '%E5%9D%9A%E6%9E%9C', other: 'x' })).toEqual({
      keyword: '坚果',
    });
  });

  it('reads a mini-program code scene', () => {
    expect(readRouteParams('product', { scene: encodeURIComponent('id=11&x=1') })).toEqual({
      id: '11',
    });
    expect(readRouteParams('product', { scene: '_' })).toEqual({});
  });
});

describe('parseLoginRedirect', () => {
  it('accepts a known route and drops unknown params', () => {
    expect(
      parseLoginRedirect(JSON.stringify({ route: 'product', params: { id: '1', evil: 'x' } })),
    ).toEqual({
      route: 'product',
      params: { id: '1' },
    });
  });

  it('refuses garbage, unknown routes and the login page itself', () => {
    expect(parseLoginRedirect('not json')).toBeNull();
    expect(parseLoginRedirect(JSON.stringify({ route: 'nope' }))).toBeNull();
    expect(parseLoginRedirect(JSON.stringify({ route: 'login' }))).toBeNull();
    expect(parseLoginRedirect(undefined)).toBeNull();
  });

  it('maps a page path back to its key', () => {
    expect(routeKeyOfPath('/packages/order/cashier/index?orderId=1')).toBe('cashier');
    expect(routeKeyOfPath('pages/nowhere')).toBeNull();
  });
});
