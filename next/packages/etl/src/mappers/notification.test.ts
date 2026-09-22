import { describe, expect, it } from 'vitest';
import {
  mapNotifications,
  parseLegacyVariables,
  translatePlaceholders,
  type LegacyMessageSystem,
  type LegacySystemNotification,
} from './notification';

/** `eb_system_notification` id 3, copied out of `crmeb/public/install/crmeb.sql`. */
const PAY_SUCCESS: LegacySystemNotification = {
  id: 3,
  mark: 'order_pay_success',
  name: '支付成功提醒消息',
  title: '支付成功提醒消息',
  is_system: 1,
  system_title: '购买成功通知',
  system_text: '您购买的商品已支付成功，支付金额{pay_price}元，订单号{order_id},感谢您的光临！',
  is_wechat: 1,
  wechat_tempkey: '43216',
  wechat_content: '订单号{{character_string2.DATA}}\n支付金额{{amount5.DATA}}',
  wechat_tempid: '',
  is_routine: 1,
  routine_tempkey: '1927',
  routine_content: '付款单号{{character_string1.DATA}}',
  routine_tempid: '',
  is_sms: 1,
  sms_id: '520268',
  sms_text: '您购买的商品已支付成功，支付金额{$pay_price}元，订单号{$order_id}。',
  variable: '{order_id}订单号,{total_num}商品总数,{pay_price}支付金额',
  type: 1,
  add_time: 1676022812,
};

/** id 4. Its twin `order_deliver_success` (id 5) maps to the same code. */
const SHIPPED: LegacySystemNotification = {
  ...PAY_SUCCESS,
  id: 4,
  mark: 'order_postage_success',
  name: '发货提醒消息',
  system_title: '发货通知',
  system_text: '亲爱的用户{nickname}您的商品{store_name}，订单号{order_id}已发货，请注意查收',
  is_routine: 2,
  is_sms: 0,
  sms_id: '',
  sms_text: '',
  variable: '{nickname}用户昵称,{store_name}商品名称,{order_id}订单号',
};

const DELIVER: LegacySystemNotification = {
  ...SHIPPED,
  id: 5,
  mark: 'order_deliver_success',
  name: '送货提醒消息',
};

describe('placeholders', () => {
  it('translates the tokens the events actually provide', () => {
    expect(translatePlaceholders('订单{order_id}支付{pay_price}').text).toBe(
      '订单{{orderNo}}支付{{amount}}',
    );
  });

  it('leaves a token with no counterpart in the text, and names it', () => {
    const out = translatePlaceholders('商品{store_name}，订单{order_id}');
    expect(out.text).toBe('商品{store_name}，订单{{orderNo}}');
    expect(out.unmapped).toEqual(['store_name']);
  });

  it('does not re-wrap a WeChat field, which is already double-braced', () => {
    const out = translatePlaceholders('订单号{{character_string2.DATA}}');
    expect(out.text).toBe('订单号{{character_string2.DATA}}');
    expect(out.unmapped).toEqual([]);
  });

  it('reads the variable column, keeping only the names an event has', () => {
    expect(parseLegacyVariables(PAY_SUCCESS.variable)).toEqual(['orderNo', 'amount']);
  });
});

describe('templates', () => {
  it('maps the legacy mark onto the registry code and keeps the channel settings', () => {
    const out = mapNotifications({ notifications: [PAY_SUCCESS] });
    expect(out.templates).toHaveLength(1);
    const row = out.templates[0]!;
    expect(row.code).toBe('order_paid');
    expect(row.audience).toBe('user');
    expect(row.channels.inApp).toEqual({
      enabled: true,
      title: '购买成功通知',
      body: '您购买的商品已支付成功，支付金额{{amount}}元，订单号{{orderNo}},感谢您的光临！',
    });
    expect(row.channels.wechatOa).toEqual({ enabled: true, templateKey: '43216' });
    expect(row.channels.wechatMini).toEqual({ enabled: true, templateKey: '1927' });
    expect(row.channels.sms?.templateCode).toBe('520268');
    expect(row.createdAt).toEqual(new Date(1676022812 * 1000));
  });

  it('never invents a WeChat field map, and says which rows need one', () => {
    const out = mapNotifications({ notifications: [PAY_SUCCESS] });
    expect(out.templates[0]!.channels.wechatOa?.fields).toBeUndefined();
    expect(out.report.templatesNeedingFieldMap).toEqual(['order_paid']);
  });

  it('keeps 关闭 as configured-but-off, and drops 不存在 entirely', () => {
    const out = mapNotifications({ notifications: [SHIPPED] });
    const channels = out.templates[0]!.channels;
    expect(channels.wechatMini?.enabled).toBe(false);
    expect(channels.sms).toBeUndefined();
  });

  it('reports a row whose wording still carries a legacy token', () => {
    const out = mapNotifications({ notifications: [SHIPPED] });
    expect(out.templates[0]!.channels.inApp?.body).toContain('{store_name}');
    expect(out.report.templatesNeedingWordingReview).toEqual(['order_shipped']);
  });

  it('takes the first of two legacy rows that share a code, and reports the second', () => {
    const out = mapNotifications({ notifications: [SHIPPED, DELIVER] });
    expect(out.templates).toHaveLength(1);
    expect(out.templates[0]!.name).toBe('发货提醒消息');
    expect(out.report.templatesDroppedDuplicateCode).toEqual(['order_deliver_success']);
  });

  it('drops a mark the registry does not know, by name', () => {
    const out = mapNotifications({
      notifications: [{ ...PAY_SUCCESS, mark: 'zhimakaimen', name: '芝麻开门' }],
    });
    expect(out.templates).toEqual([]);
    expect(out.report.templatesDroppedUnknownMark).toEqual(['zhimakaimen（芝麻开门）']);
  });

  it('drops a mapped mark the running registry no longer registers', () => {
    const out = mapNotifications({
      notifications: [PAY_SUCCESS],
      registryCodes: ['order_shipped'],
    });
    expect(out.templates).toEqual([]);
    expect(out.report.templatesDroppedUnknownMark).toHaveLength(1);
    expect(out.report.templatesNotInLegacy).toEqual(['order_shipped']);
  });

  it('lists the registry codes no legacy row fed, so they seed from defaults', () => {
    const out = mapNotifications({
      notifications: [PAY_SUCCESS],
      registryCodes: ['order_paid', 'admin_low_stock', 'order_created'],
    });
    expect(out.report.templatesNotInLegacy).toEqual(['admin_low_stock', 'order_created']);
  });

  it('routes an admin notification to the admin audience', () => {
    const out = mapNotifications({
      notifications: [{ ...PAY_SUCCESS, mark: 'admin_pay_success_code', type: 2 }],
    });
    expect(out.templates[0]!.code).toBe('admin_order_paid');
    expect(out.templates[0]!.audience).toBe('admin');
  });
});

describe('messages', () => {
  const MESSAGE: LegacyMessageSystem = {
    id: 11,
    mark: 'order_pay_success',
    uid: 7,
    title: '购买成功通知',
    content: '您购买的商品已支付成功',
    data: '{"order_id":"wx123"}',
    look: 0,
    type: 1,
    add_time: 1676022812,
    is_del: 0,
  };

  it('maps an unread customer message', () => {
    const out = mapNotifications({ messages: [MESSAGE] });
    expect(out.messages[0]).toEqual({
      id: 11,
      code: 'order_paid',
      audience: 'user',
      userId: 7,
      adminId: null,
      title: '购买成功通知',
      content: '您购买的商品已支付成功',
      data: { order_id: 'wx123' },
      readAt: null,
      createdAt: new Date(1676022812 * 1000),
      deletedAt: null,
    });
    expect(out.report.messagesUnread).toBe(1);
  });

  it('puts an admin message on adminId, not userId', () => {
    const out = mapNotifications({ messages: [{ ...MESSAGE, type: 2 }] });
    expect(out.messages[0]).toMatchObject({ audience: 'admin', adminId: 7, userId: null });
  });

  it('marks a read message read at its creation time, the only timestamp there is', () => {
    const out = mapNotifications({ messages: [{ ...MESSAGE, look: 1 }] });
    expect(out.messages[0]!.readAt).toEqual(new Date(1676022812 * 1000));
    expect(out.report.messagesUnread).toBe(0);
  });

  it('drops a soft-deleted message rather than carrying the tombstone', () => {
    const out = mapNotifications({ messages: [{ ...MESSAGE, is_del: 1 }] });
    expect(out.messages).toEqual([]);
    expect(out.report.messagesDroppedDeleted).toBe(1);
  });

  it('drops a message whose recipient did not survive the migration', () => {
    const out = mapNotifications({ messages: [MESSAGE], knownUserIds: new Set([1, 2]) });
    expect(out.messages).toEqual([]);
    expect(out.report.messagesDroppedUnknownRecipient).toBe(1);
  });

  it('keeps a free-form message whose mark means nothing, with a null code', () => {
    const out = mapNotifications({ messages: [{ ...MESSAGE, mark: 'notice', data: '' }] });
    expect(out.messages[0]).toMatchObject({ code: null, data: null });
  });

  it('survives a data column that is not JSON', () => {
    const out = mapNotifications({ messages: [{ ...MESSAGE, data: 'order_id=3' }] });
    expect(out.messages[0]!.data).toBeNull();
  });
});
