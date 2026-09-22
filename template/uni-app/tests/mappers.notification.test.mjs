// 站内信 and the WeChat helpers (`wx.config`, 订阅消息模板).
//
// Fixtures are the contracts' own examples, so a mapper is never tested against a
// payload the author of the test invented.

import { example, assertRenderable } from './helpers.mjs';
import {
  toLegacyMessage,
  toLegacyMessageList,
  toLegacyMarkRead,
} from '../api/mappers/notification.js';
import { toLegacyJssdkConfig, toLegacySubscribeTemplates } from '../api/mappers/wechat.js';

describe('notification — 站内信', () => {
  it('gives the 消息中心 the {list, count} it concats onto', () => {
    const page = toLegacyMessageList(example('GET /api/v1/my-messages'));
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
    expect(toLegacyMessage({ id: '1', readAt: null }).look).toBe(0);
    expect(toLegacyMessage({ id: '1', readAt: '2026-01-06T10:00:00+08:00' }).look).toBe(1);
  });

  it('always hands over a `data` object, never null', () => {
    expect(toLegacyMessage({ id: '1' }).data).toEqual({});
    expect(toLegacyMessage({ id: '1', data: null }).data).toEqual({});
    expect(toLegacyMessage(example('GET /api/v1/my-messages/:id')).data).toEqual({
      orderId: '1024',
      link: '/orders/1024',
    });
  });

  it('answers an empty list rather than throwing on an empty page', () => {
    expect(toLegacyMessageList(null)).toEqual({ list: [], count: 0 });
    expect(toLegacyMessage(null)).toEqual({});
  });

  it('reports how many rows a 已读 actually changed, so a double tap reads 0', () => {
    expect(toLegacyMarkRead(example('POST /api/v1/my-messages/:id/read'))).toEqual({ marked: 1 });
    expect(toLegacyMarkRead({ marked: 0 })).toEqual({ marked: 0 });
    expect(toLegacyMarkRead(null)).toEqual({ marked: 0 });
  });
});

describe('wechat — JS-SDK 与订阅消息', () => {
  it('hands wx.config exactly the four fields it signs over', () => {
    const config = toLegacyJssdkConfig(example('GET /api/v1/wechat/jssdk-config'));
    expect(config).toEqual({
      appId: 'wx1234567890abcdef',
      // a string, because that is what the signature was computed over
      timestamp: '1767668400',
      nonceStr: 'A1b2C3d4E5f6G7h8',
      signature: '0f9de62fce790f9a083d5c99e95740ceb90c27ed',
    });
    expect(toLegacyJssdkConfig(null)).toEqual({});
  });

  it('flattens the template ids for one scene', () => {
    expect(toLegacySubscribeTemplates(example('GET /api/v1/wechat/subscribe-templates'))).toEqual([
      'ZCQ1oT0cD2mYy1Q-kLJbo2kQ3s6cxJ5Zx9pLb-7xQ1A',
      'HdLq2mW5vN8kR3pT-yUxZ6bA1cE4gJ7nM0oP9sV2iK',
    ]);
  });

  it('treats "no templates configured" as an empty list, not an error', () => {
    expect(toLegacySubscribeTemplates({ templateIds: [] })).toEqual([]);
    expect(toLegacySubscribeTemplates(null)).toEqual([]);
    // a null in the array would make requestSubscribeMessage reject the whole call
    expect(toLegacySubscribeTemplates({ templateIds: ['a', null, ''] })).toEqual(['a']);
  });
});
