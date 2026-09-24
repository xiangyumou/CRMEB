import { describe, expect, it } from 'vitest';
import type { NotificationEvent } from './notification.registry';
import { describeOutcome, explainPreview, subscribeFieldProblem } from './notification.preview';

const SHIPPED: NotificationEvent = {
  code: 'order_shipped',
  name: '订单发货通知',
  description: '',
  audience: 'user',
  variables: ['orderId', 'orderNo', 'company', 'trackingNo'],
  channels: ['inApp', 'wechatOa', 'wechatMini', 'sms'],
  defaults: { title: '您的订单已发货', body: '订单 {{orderNo}} 已发货' },
  route: { route: 'order', params: { id: '{{orderId}}' } },
};

const DATA = { orderId: '1001', orderNo: 'SO1', company: '顺丰速运', trackingNo: 'SF123' };

describe('explainPreview', () => {
  it('renders every supported channel through the send path', () => {
    const result = explainPreview({
      event: SHIPPED,
      origin: 'https://shop.example.com',
      data: DATA,
      channels: {
        inApp: { enabled: true, title: '', body: '{{orderNo}} 由 {{company}} 发出' },
        wechatOa: {
          enabled: true,
          templateKey: '',
          templateId: 'TPL',
          fields: { keyword1: '{{orderNo}}', keyword2: '{{trackingNo}}' },
          linkUrl: '/orders/{{orderId}}',
        },
        wechatMini: {
          enabled: true,
          templateKey: '',
          templateId: 'MINI',
          fields: { character_string1: '{{orderNo}}', thing2: '{{company}}' },
        },
        sms: { enabled: false, templateCode: '' },
      },
    });
    expect(result.inApp).toEqual({
      enabled: true,
      title: '您的订单已发货',
      content: 'SO1 由 顺丰速运 发出',
      opens: 'packages/order/detail/index?id=1001',
    });
    expect(result.wechatOa).toMatchObject({
      url: 'https://shop.example.com/orders/1001',
      fields: [
        { key: 'keyword1', value: 'SO1' },
        { key: 'keyword2', value: 'SF123' },
      ],
    });
    expect(result.wechatMini?.page).toBe('packages/order/detail/index?id=1001');
    expect(result.sms).toMatchObject({ enabled: false, templateCode: '' });
    // SMS is off, so its missing template code is not a warning.
    expect(result.warnings).toEqual([]);
  });

  it('says what the send would silently do', () => {
    const result = explainPreview({
      event: SHIPPED,
      origin: '',
      data: { ...DATA, trackingNo: '' },
      channels: {
        inApp: { enabled: true, title: '{{orderNo}}', body: '{{trackngNo}} 运单 {{trackingNo}}' },
        wechatOa: {
          enabled: true,
          templateKey: '',
          fields: { keyword1: '{{trackingNo}}' },
          linkUrl: '/orders/{{orderId}}',
        },
        wechatMini: {
          enabled: true,
          templateKey: '',
          templateId: 'MINI',
          fields: { thing2: '一'.repeat(21), character_string1: '订单 SO1' },
        },
      },
    });
    expect(result.warnings).toEqual([
      '{{trackngNo}} 不是这个通知的变量（用在：站内信正文），发出去会是空的',
      '示例数据里 {{trackingNo}} 为空（用在：站内信正文、公众号 keyword1），这一处会显示为空',
      '公众号：还没填模板 ID，不会发送',
      '公众号：跳转链接是相对路径，但站点设置里没有对外域名，发送时会去掉链接',
      '公众号字段 keyword1 渲染后为空，发送时会被去掉',
      '公众号：所有字段渲染后都为空，不会发送',
      '小程序字段 thing2：超过 20 个字（现在 21 个），微信会拒收整条消息（47003）',
      '小程序字段 character_string1：只能是字母、数字和符号，不能有汉字或空格，微信会拒收整条消息（47003）',
    ]);
  });

  it('gives an admin event only its in-app message, opening the admin path', () => {
    const result = explainPreview({
      event: {
        code: 'refund_requested',
        name: '退款申请',
        description: '',
        audience: 'admin',
        variables: ['orderId'],
        channels: ['inApp'],
        defaults: { title: '新的退款申请', body: '' },
        link: '/admin/orders/{{orderId}}',
      },
      origin: '',
      data: DATA,
      channels: { inApp: { enabled: true, title: '', body: '' } },
    });
    expect(result).toMatchObject({ wechatOa: null, wechatMini: null, sms: null });
    expect(result.inApp?.opens).toBe('/admin/orders/1001');
  });
});

describe('subscribeFieldProblem', () => {
  it('checks the value against the field type', () => {
    expect(subscribeFieldProblem('amount3', '199.00')).toBeNull();
    expect(subscribeFieldProblem('amount3', '¥199.00')).toBeNull();
    expect(subscribeFieldProblem('amount3', '一百')).toMatch(/金额格式/);
    expect(subscribeFieldProblem('phrase4', '已发货')).toBeNull();
    expect(subscribeFieldProblem('phrase4', '已经在路上了')).toMatch(/超过 5 个字/);
    expect(subscribeFieldProblem('time5', '随便')).toBeNull();
  });
});

describe('describeOutcome', () => {
  it('puts WeChat codes and skip reasons in the operator’s words', () => {
    expect(describeOutcome('wechatOa', { kind: 'sent' })).toEqual({
      outcome: 'sent',
      message: '已发送，请在微信里查收',
    });
    expect(
      describeOutcome('wechatMini', { kind: 'skipped', reason: 'wechatMini 43101: user refuse' }),
    ).toEqual({
      outcome: 'skipped',
      message:
        '没有发出：该会员没有订阅这条消息——小程序订阅消息要用户先在小程序里点过「允许」（wechatMini 43101: user refuse）',
    });
    expect(
      describeOutcome('sms', { kind: 'skipped', reason: 'no sms provider registered' }),
    ).toEqual({ outcome: 'skipped', message: '没有发出：没有配置短信服务商（系统设置 → 短信）' });
    expect(describeOutcome('sms', { kind: 'failed', reason: 'sms isv.X boom' }).message).toBe(
      '发送失败：sms isv.X boom',
    );
  });
});
