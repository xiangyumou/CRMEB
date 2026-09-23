// 站内信 and the WeChat helpers (`wx.config`, 订阅消息模板).
//
// Fixtures are the contracts' own examples, so a mapper is never tested against a
// payload the author of the test invented.

import { example, assertRenderable } from './helpers.mjs';
import {
  toPageMessage,
  toPageMessageList,
  toPageMarkRead,
} from '../api/mappers/notification.js';
import {
  toPageJssdkConfig,
  toPageSubscribeTemplates,
  fromPageMiniCodeQuery,
  toPageMiniCode,
  MINI_CODE_PAGES,
} from '../api/mappers/wechat.js';

describe('notification — 站内信', () => {
  it('gives the 消息中心 the {list, count} it concats onto', () => {
    const page = toPageMessageList(example('GET /api/v1/my-messages'));
    expect(page.count).toBe(1);
    expect(page.list[0]).toMatchObject({
      id: 5001,
      type: 1,
      code: 'order_shipped',
      title: '您的订单已发货',
      look: 0,
      add_time: '2026-01-06 09:00:00',
    });
    expect(page.list[0].content).toContain('顺丰速运');
    assertRenderable(page);
  });

  it('derives the read flag from readAt, which is what the row stores now', () => {
    expect(toPageMessage({ id: '1', readAt: null }).look).toBe(0);
    expect(toPageMessage({ id: '1', readAt: '2026-01-06T10:00:00+08:00' }).look).toBe(1);
  });

  it('always hands over a `data` object, never null', () => {
    expect(toPageMessage({ id: '1' }).data).toEqual({});
    expect(toPageMessage({ id: '1', data: null }).data).toEqual({});
    expect(toPageMessage(example('GET /api/v1/my-messages/:id')).data).toEqual({
      orderId: '1024',
      link: '/orders/1024',
    });
  });

  it('answers an empty list rather than throwing on an empty page', () => {
    expect(toPageMessageList(null)).toEqual({ list: [], count: 0 });
    expect(toPageMessage(null)).toEqual({});
  });

  it('reports how many rows a 已读 actually changed, so a double tap reads 0', () => {
    expect(toPageMarkRead(example('POST /api/v1/my-messages/:id/read'))).toEqual({ marked: 1 });
    expect(toPageMarkRead({ marked: 0 })).toEqual({ marked: 0 });
    expect(toPageMarkRead(null)).toEqual({ marked: 0 });
  });
});

describe('wechat — JS-SDK 与订阅消息', () => {
  it('hands wx.config exactly the four fields it signs over', () => {
    const config = toPageJssdkConfig(example('GET /api/v1/wechat/jssdk-config'));
    expect(config).toEqual({
      appId: 'wx1234567890abcdef',
      // a string, because that is what the signature was computed over
      timestamp: '1767668400',
      nonceStr: 'A1b2C3d4E5f6G7h8',
      signature: '0f9de62fce790f9a083d5c99e95740ceb90c27ed',
    });
    expect(toPageJssdkConfig(null)).toEqual({});
  });

  it('flattens the template ids for one scene', () => {
    expect(toPageSubscribeTemplates(example('GET /api/v1/wechat/subscribe-templates'))).toEqual([
      'ZCQ1oT0cD2mYy1Q-kLJbo2kQ3s6cxJ5Zx9pLb-7xQ1A',
      'HdLq2mW5vN8kR3pT-yUxZ6bA1cE4gJ7nM0oP9sV2iK',
    ]);
  });

  it('treats "no templates configured" as an empty list, not an error', () => {
    expect(toPageSubscribeTemplates({ templateIds: [] })).toEqual([]);
    expect(toPageSubscribeTemplates(null)).toEqual([]);
    // a null in the array would make requestSubscribeMessage reject the whole call
    expect(toPageSubscribeTemplates({ templateIds: ['a', null, ''] })).toEqual(['a']);
  });
});

describe('小程序码 (GET /api/v1/wechat/mini-qrcodes)', () => {
  const SCENE = /^[0-9a-zA-Z!#$&'()*+,/:;=?@\-._~]{1,32}$/;

  it('asks for the product page with the id and the spreader the page reads back', () => {
    const query = fromPageMiniCodeQuery('product', 1024, 7);
    expect(query).toEqual({ page: 'pages/goods_details/index', scene: 'id=1024&pid=7' });
    expect(query.scene).toMatch(SCENE);
    // the contract's own example is the signed-out form
    expect(fromPageMiniCodeQuery('product', 1024, 0).scene).toBe('id=1024');
  });

  it('points 拼团 at its detail page and the personal code at the home page', () => {
    expect(fromPageMiniCodeQuery('groupbuy', '12', '5')).toEqual({
      page: 'pages/activity/goods_combination_details/index',
      scene: 'id=12&pid=5',
    });
    expect(fromPageMiniCodeQuery('home', '', 5)).toEqual({ page: 'pages/index/index', scene: 'spid=5' });
    expect(fromPageMiniCodeQuery('home', '', undefined).scene).toBe('home');
  });

  it('only ever asks for one of the four pages the route accepts', () => {
    const allowed = [
      'pages/index/index',
      'pages/goods_details/index',
      'pages/activity/goods_combination_details/index',
      'pages/activity/presell_details/index',
    ];
    for (const page of Object.values(MINI_CODE_PAGES)) expect(allowed).toContain(page);
  });

  it('drops the spreader rather than overflow the 32-character scene', () => {
    const scene = fromPageMiniCodeQuery('product', '12345678901234567890', '98765432109876').scene;
    expect(scene).toBe('id=12345678901234567890');
    expect(scene).toMatch(SCENE);
  });

  it('answers under both names the pages read', () => {
    const url = '/uploads/wechat-mini-code/2026/09/4f1c8a2d7e6b5039.png';
    expect(toPageMiniCode(example('GET /api/v1/wechat/mini-qrcodes'))).toEqual({ code: url, url });
    expect(toPageMiniCode(null)).toEqual({ code: '', url: '' });
  });
});
