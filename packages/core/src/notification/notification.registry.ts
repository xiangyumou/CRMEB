import type { NotificationChannel } from '@shop/contracts/notification/schemas';

/**
 * The registry of business events that produce a notification.
 *
 * **Codes are compiled in; only the wording and the switches are data.** An
 * operator-editable code would let a typo in the admin silently stop every send
 * of that event with no error anywhere. Here `notification_templates.code` is a
 * foreign key onto this table in spirit: a row whose code is not in the
 * registry is ignored, and a registry entry with no row is seeded on first
 * read.
 *
 * ## What is deliberately not here
 *
 * - SMS verification codes: the `sms` domain sends them, and they are not a
 *   business event.
 * - Events another domain owns the wording of: group buy, presale, payment
 *   and refund register their own entries with `registerNotificationEvents`
 *   from their `index.ts`.
 * - Same-city delivery and distribution/brokerage events: those features are
 *   out of scope.
 */

export type NotificationAudience = 'user' | 'admin';

export interface NotificationEvent {
  /** Stable key. Appears in `notification_templates.code` and in the effect's scope id. */
  code: string;
  name: string;
  description: string;
  audience: NotificationAudience;
  /**
   * Placeholders the event provides. Rendered from the effect payload; the
   * admin form lists them so an operator does not have to guess.
   */
  variables: readonly string[];
  /**
   * Channels this event may use at all.
   *
   * An admin event has no openid and no phone number we are entitled to text,
   * so it is in-app only. A user event can use all four.
   */
  channels: readonly NotificationChannel[];
  /**
   * For `audience: 'admin'`: the permission atom an admin must hold to receive
   * it. Fan-out resolves recipients by this, so the person who cannot open
   * 退款单 is not woken up by one.
   */
  permission?: string;
  /** Default in-app wording, used to seed the row the first time it is read. */
  defaults: { title: string; body: string };
  /** Where tapping the message goes. `{{…}}` is substituted like the body. */
  link?: string;
}

const USER_CHANNELS = ['inApp', 'wechatOa', 'wechatMini', 'sms'] as const;
const ADMIN_CHANNELS = ['inApp'] as const;

const registry = new Map<string, NotificationEvent>();

/**
 * Declares events. Idempotent per code: registering the same code twice with
 * the same name is free (a module reload in dev), with a different name throws.
 *
 * Other domains call this from their own `index.ts` (group buy, presale,
 * payment, refund), which is why it is exported rather than the table being a
 * frozen constant.
 */
export function registerNotificationEvents(events: readonly NotificationEvent[]): void {
  for (const event of events) {
    if (!/^[a-z][a-z0-9_]*$/.test(event.code)) {
      throw new Error(`notification event "${event.code}" 必须是小写下划线命名`);
    }
    const existing = registry.get(event.code);
    if (existing && existing.name !== event.name) {
      throw new Error(`notification event "${event.code}" 重复定义`);
    }
    if (event.audience === 'admin' && !event.permission) {
      throw new Error(`notification event "${event.code}" 是后台通知，必须声明 permission`);
    }
    registry.set(event.code, event);
  }
}

export function findNotificationEvent(code: string): NotificationEvent | undefined {
  return registry.get(code);
}

export function allNotificationEvents(): NotificationEvent[] {
  return [...registry.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Test helper. Never call this from app code. */
export function resetNotificationRegistry(): void {
  registry.clear();
}

// ---------------------------------------------------------------------------
// the built-in events
// ---------------------------------------------------------------------------

const ORDER_VARS = ['orderId', 'orderNo', 'amount', 'nickname'] as const;

/**
 * Registered from `notification/index.ts`, which the generated
 * `@shop/core/domains` bucket imports once per app. Safe to call twice.
 */
export function registerBuiltInNotificationEvents(): void {
  registerNotificationEvents([
    // -- user ---------------------------------------------------------------
    {
      code: 'order_created',
      name: '下单成功提醒',
      description: '买家提交订单后立即发送',
      audience: 'user',
      variables: [...ORDER_VARS],
      channels: [...USER_CHANNELS],
      defaults: { title: '订单提交成功', body: '订单 {{orderNo}} 已提交，应付 ¥{{amount}}。' },
      link: '/orders/{{orderId}}',
    },
    {
      code: 'order_paid',
      name: '支付成功提醒',
      description: '支付成功后发送给买家',
      audience: 'user',
      variables: [...ORDER_VARS, 'paidAt'],
      channels: [...USER_CHANNELS],
      defaults: {
        title: '支付成功',
        body: '订单 {{orderNo}} 已支付 ¥{{amount}}，我们会尽快发货。',
      },
      link: '/orders/{{orderId}}',
    },
    {
      code: 'order_shipped',
      name: '订单发货通知',
      description: '订单发货后通知买家。虚拟商品自动发货也走这里',
      audience: 'user',
      variables: [...ORDER_VARS, 'company', 'trackingNo'],
      channels: [...USER_CHANNELS],
      defaults: {
        title: '您的订单已发货',
        body: '订单 {{orderNo}} 已由 {{company}} 发出，运单号 {{trackingNo}}。',
      },
      link: '/orders/{{orderId}}',
    },
    {
      code: 'order_received',
      name: '确认收货提醒',
      description: '买家确认收货或系统自动收货后发送',
      audience: 'user',
      variables: [...ORDER_VARS],
      channels: [...USER_CHANNELS],
      defaults: { title: '确认收货成功', body: '订单 {{orderNo}} 已确认收货，感谢您的购买。' },
      link: '/orders/{{orderId}}',
    },
    {
      code: 'order_completed',
      name: '订单完成提醒',
      description: '订单结束后发送',
      audience: 'user',
      variables: [...ORDER_VARS],
      channels: [...USER_CHANNELS],
      defaults: { title: '订单已完成', body: '订单 {{orderNo}} 已完成，期待再次为您服务。' },
      link: '/orders/{{orderId}}',
    },
    {
      code: 'order_cancelled',
      name: '订单取消提醒',
      description: '订单被取消（买家取消、超时未付款、后台取消）后发送',
      audience: 'user',
      variables: [...ORDER_VARS, 'reason'],
      channels: [...USER_CHANNELS],
      defaults: { title: '订单已取消', body: '订单 {{orderNo}} 已取消。' },
      link: '/orders/{{orderId}}',
    },
    {
      code: 'order_price_changed',
      name: '订单改价提醒',
      description: '后台修改订单金额后通知买家',
      audience: 'user',
      variables: [...ORDER_VARS, 'oldAmount'],
      channels: [...USER_CHANNELS],
      defaults: {
        title: '订单金额已修改',
        body: '订单 {{orderNo}} 的金额由 ¥{{oldAmount}} 改为 ¥{{amount}}，请重新支付。',
      },
      link: '/orders/{{orderId}}',
    },
    {
      code: 'order_unpaid_reminder',
      name: '未付款提醒',
      description: '订单即将超时未付款时提醒买家',
      audience: 'user',
      variables: [...ORDER_VARS, 'expiresAt'],
      channels: [...USER_CHANNELS],
      defaults: { title: '订单待付款', body: '订单 {{orderNo}} 还未付款，请尽快完成支付。' },
      link: '/orders/{{orderId}}',
    },
    {
      code: 'refund_applied',
      name: '退款申请已提交',
      description: '买家提交退款申请后的回执',
      audience: 'user',
      variables: ['refundId', 'refundNo', 'orderNo', 'amount'],
      channels: [...USER_CHANNELS],
      defaults: { title: '退款申请已提交', body: '退款单 {{refundNo}} 已提交，我们会尽快处理。' },
      link: '/refunds/{{refundId}}',
    },
    {
      code: 'refund_approved',
      name: '退款申请通过',
      description: '客服同意退款后发送',
      audience: 'user',
      variables: ['refundId', 'refundNo', 'orderNo', 'amount'],
      channels: [...USER_CHANNELS],
      defaults: {
        title: '退款申请已通过',
        body: '退款单 {{refundNo}} 已通过审核，退款将原路返回。',
      },
      link: '/refunds/{{refundId}}',
    },
    {
      code: 'refund_rejected',
      name: '退款申请驳回',
      description: '客服拒绝退款后发送',
      audience: 'user',
      variables: ['refundId', 'refundNo', 'orderNo', 'reason'],
      channels: [...USER_CHANNELS],
      defaults: { title: '退款申请未通过', body: '退款单 {{refundNo}} 未通过审核：{{reason}}。' },
      link: '/refunds/{{refundId}}',
    },
    {
      code: 'refund_settled',
      name: '退款到账提醒',
      description: '退款成功打回原支付渠道后发送',
      audience: 'user',
      variables: ['refundId', 'refundNo', 'orderNo', 'amount'],
      channels: [...USER_CHANNELS],
      defaults: { title: '退款已到账', body: '退款单 {{refundNo}} 的 ¥{{amount}} 已原路退回。' },
      link: '/refunds/{{refundId}}',
    },

    // -- admin --------------------------------------------------------------
    {
      code: 'admin_order_created',
      name: '新订单提醒',
      description: '有新订单提交时提醒有订单查看权限的管理员',
      audience: 'admin',
      permission: 'order:order:read',
      variables: [...ORDER_VARS],
      channels: [...ADMIN_CHANNELS],
      defaults: { title: '新订单', body: '订单 {{orderNo}} 已提交，金额 ¥{{amount}}。' },
      link: '/admin/orders/{{orderId}}',
    },
    {
      code: 'admin_order_paid',
      name: '新支付订单提醒',
      description: '有订单付款时提醒',
      audience: 'admin',
      permission: 'order:order:read',
      variables: [...ORDER_VARS],
      channels: [...ADMIN_CHANNELS],
      defaults: { title: '新的已付款订单', body: '订单 {{orderNo}} 已付款，金额 ¥{{amount}}。' },
      link: '/admin/orders/{{orderId}}',
    },
    {
      code: 'admin_order_received',
      name: '用户确认收货提醒',
      description: '买家确认收货时提醒',
      audience: 'admin',
      permission: 'order:order:read',
      variables: [...ORDER_VARS],
      channels: [...ADMIN_CHANNELS],
      defaults: { title: '用户已确认收货', body: '订单 {{orderNo}} 已由买家确认收货。' },
      link: '/admin/orders/{{orderId}}',
    },
    {
      code: 'admin_refund_applied',
      name: '用户申请退款提醒',
      description: '买家提交退款申请时提醒能处理售后的管理员',
      audience: 'admin',
      permission: 'refund:request:read',
      variables: ['refundId', 'refundNo', 'orderNo', 'amount', 'reason'],
      channels: [...ADMIN_CHANNELS],
      defaults: { title: '新的退款申请', body: '退款单 {{refundNo}} 待处理，金额 ¥{{amount}}。' },
      link: '/admin/refunds/{{refundId}}',
    },
    {
      code: 'admin_low_stock',
      name: '库存预警',
      description: '商品库存低于预警值时提醒',
      audience: 'admin',
      permission: 'catalog:product:read',
      variables: ['productId', 'productName', 'stock', 'threshold'],
      channels: [...ADMIN_CHANNELS],
      defaults: {
        title: '库存预警',
        body: '{{productName}} 仅剩 {{stock}} 件，低于预警值 {{threshold}}。',
      },
      link: '/admin/catalog/products/{{productId}}',
    },
    {
      code: 'admin_payment_exception',
      name: '支付异常提醒',
      description: '出现需要人工核对的支付异常时提醒',
      audience: 'admin',
      permission: 'payment:exception:read',
      variables: ['exceptionId', 'outTradeNo', 'amount', 'reason'],
      channels: [...ADMIN_CHANNELS],
      defaults: { title: '支付异常待处理', body: '{{outTradeNo}}：{{reason}}。' },
      link: '/admin/payment-exceptions/{{exceptionId}}',
    },
  ]);
}
