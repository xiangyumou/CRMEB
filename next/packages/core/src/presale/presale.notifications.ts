import { registerNotificationEvents } from '../notification';

/**
 * What a presale shopper is told, and when.
 *
 * | code               | sent by                   | when                                           |
 * | ------------------ | ------------------------- | ---------------------------------------------- |
 * | `presale_paid`     | the `presale.paid` effect | the order is paid and its ship date is fixed   |
 * | `presale_sold_out` | the `presale.refund` one  | the campaign's quota filled while it was paid  |
 *
 * Presale is full payment only (a deposit campaign is refused at creation), so
 * there is no 尾款 to remind anybody of. Shipping, cancelling and an ordinary
 * refund are the order domain's own notices and reach a presale order like any
 * other; the one thing only presale knows is the promise — "not before this
 * day" — and that is what `presale_paid` says.
 *
 * `presale_sold_out` is recorded in the transaction that opens the automatic
 * refund, so it exists exactly when the refund does.
 *
 * Both link to the uni-app order page, which routes on the order number.
 */

export const PRESALE_EVENTS = {
  paid: 'presale_paid',
  soldOut: 'presale_sold_out',
} as const;

const ORDER_LINK = '/pages/goods/order_details/index?order_id={{orderNo}}';
const USER_CHANNELS = ['inApp', 'wechatOa', 'wechatMini', 'sms'] as const;

/** Idempotent: the registry accepts the same code twice with the same name. */
export function registerPresaleNotificationEvents(): void {
  registerNotificationEvents([
    {
      code: PRESALE_EVENTS.paid,
      name: '预售付款成功提醒',
      description: '预售订单付款后发送，告知最早发货日期',
      audience: 'user',
      variables: ['orderId', 'orderNo', 'activityTitle', 'amount', 'shipDate'],
      channels: [...USER_CHANNELS],
      defaults: {
        title: '预售付款成功',
        body: '您预订的「{{activityTitle}}」已付款 ¥{{amount}}，将于 {{shipDate}} 起发货。',
      },
      link: ORDER_LINK,
    },
    {
      code: PRESALE_EVENTS.soldOut,
      name: '预售名额已满退款提醒',
      description: '付款时预售限购总量恰好已满、系统发起自动退款时发送',
      audience: 'user',
      variables: ['orderId', 'orderNo', 'activityTitle', 'amount', 'refundId'],
      channels: [...USER_CHANNELS],
      defaults: {
        title: '预售名额已满',
        body: '「{{activityTitle}}」的预售名额已满，订单 {{orderNo}} 的 ¥{{amount}} 将原路退回。',
      },
      link: ORDER_LINK,
    },
  ]);
}
