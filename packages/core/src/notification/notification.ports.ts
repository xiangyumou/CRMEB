import type { Ctx } from '../kernel/context';

/**
 * The seam onto the `sms` domain's sender.
 *
 * `core/src/sms/` writes `sms_logs`; this domain only decides *that* an SMS
 * should go out and with which template code and parameters. The port follows
 * the shape `order/ports.ts` established — a slot, a registrar and a `resolve*`
 * that returns `undefined` — because a shop with no SMS account is the normal
 * case, not a broken one.
 *
 * Returning a result object rather than throwing is deliberate and matches the
 * WeChat client: these calls run behind the effects ledger, where a thrown
 * error costs a retry of the *whole* fan-out — including the channels that
 * already succeeded.
 */

export interface SmsSendResult {
  ok: boolean;
  /** Provider code when it failed; free-form, only for the send log. */
  errorCode?: string;
  errorMessage?: string;
}

export interface SmsPort {
  /**
   * `templateCode` is the provider's own (`SMS_123456`), `params` the rendered
   * variables. The implementation resolves the phone number from the user and
   * enforces the per-phone budget; this domain must not be able to bypass it.
   */
  send(
    ctx: Ctx,
    input: {
      userId: number;
      templateCode: string;
      signName?: string;
      params: Record<string, string>;
      notificationCode: string;
    },
  ): Promise<SmsSendResult>;
}

let sms: SmsPort | undefined;

export function registerSmsPort(impl: SmsPort): void {
  sms = impl;
}

/**
 * `undefined` means no SMS provider is wired — the `sms` domain is not loaded,
 * or the shop configured `provider: 'none'`. The channel is then skipped and
 * recorded as skipped, never as failed: parking an effect for a channel the
 * shop deliberately does not use would fill the operator's queue with rows they
 * cannot act on.
 */
export function resolveSmsPort(): SmsPort | undefined {
  return sms;
}

/** Test helper. Never call this from app code. */
export function resetNotificationPorts(): void {
  sms = undefined;
}
