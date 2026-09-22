import type { Ctx } from '../kernel/context';

/**
 * The SMS provider seam.
 *
 * One method, because that is all the shop does with SMS: hand a template id
 * and its variables to a provider and learn whether it was accepted. Delivery
 * receipts are a webhook nobody asked for, and the legacy system did not have
 * them either.
 *
 * `send` **never throws**. A provider outage must not turn 发送验证码 into a
 * 500 — the caller needs to distinguish "we could not send" (a 502 the shopper
 * can retry) from a bug, and an exception crossing this boundary loses that.
 */

export interface SmsMessage {
  /** Mainland mobile number, digits only. */
  phone: string;
  /** The provider's own template id, from the `sms` config group. */
  templateId: string;
  /** Template variables. Values are stringified by the caller. */
  params: Record<string, string>;
}

export interface SmsSendResult {
  ok: boolean;
  /** Provider-side id, for support tickets. */
  messageId?: string;
  /** The provider's own failure code, e.g. `isv.BUSINESS_LIMIT_CONTROL`. */
  providerCode?: string;
  /** Human-readable reason. Logged, never shown to the shopper. */
  error?: string;
}

export interface SmsSender {
  /** `aliyun`, `tencent`, `fake`. Logged with every send. */
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}

/**
 * A sender registered at boot, which wins over whatever the config group says.
 *
 * This exists for two callers and no others: the integration tests, which
 * register `fakeSmsSender()`, and a future stream that needs to route SMS
 * through something the config group cannot describe. Production leaves it
 * unset and the provider comes from `sms.provider`.
 */
let override: SmsSender | undefined;

export function registerSmsSender(sender: SmsSender): void {
  override = sender;
}

export function getSmsSenderOverride(): SmsSender | undefined {
  return override;
}

/** Test helper. Never call this from app code. */
export function resetSmsSender(): void {
  override = undefined;
}

/**
 * The sender that answers "no provider configured".
 *
 * It refuses rather than pretending to succeed. A shop with no SMS account
 * cannot send login codes, and the honest failure is a 502 the operator can
 * see in the log — not a silent success that leaves every shopper staring at a
 * code that will never arrive. It is emphatically *not* a development mode
 * that logs the code: that is one environment variable away from being a
 * production authentication bypass.
 */
export const nullSmsSender: SmsSender = {
  name: 'none',
  send: () =>
    Promise.resolve({
      ok: false,
      providerCode: 'NOT_CONFIGURED',
      error: '未配置短信服务商（系统设置 → 短信设置）',
    }),
};

export type SmsSenderFactory = (ctx: Ctx) => Promise<SmsSender>;
