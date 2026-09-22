/**
 * The `sms` domain's public surface.
 *
 * | Function                | Caller      | When                                        |
 * | ----------------------- | ----------- | ------------------------------------------- |
 * | `sendVerificationCode`  | E1 (`user`) | 发送验证码 on every login / bind flow        |
 * | `verifyCode`            | E1 (`user`) | inside the flow that consumes the code       |
 * | `registerSmsSender`     | tests, boot | swap the provider without touching config    |
 *
 * `verifyCode` throws — it is always called inside a user-facing transaction
 * that must not continue — while `SmsSender.send` never throws, because a
 * provider outage is a refusal the caller has to shape into a 502.
 *
 * This domain has **no config group of its own**: the provider credentials and
 * the per-phone budgets are F1's `sms` group, and the code TTL / attempt budget
 * belong to the login flow, so they live in the `user` domain's
 * `storefront-auth` group and arrive as arguments.
 */
export { sendVerificationCode, verifyCode, resolveSender } from './sms.service';
export type { SendCodeOptions, SendCodeResult } from './sms.service';

export {
  getSmsSenderOverride,
  nullSmsSender,
  registerSmsSender,
  resetSmsSender,
  type SmsMessage,
  type SmsSender,
  type SmsSendResult,
} from './sms.port';

export { createAliyunSmsSender, type AliyunSmsOptions } from './sms-aliyun';
export { fakeSmsSender, type FakeSmsSender } from './sms.fake';

export {
  CODE_LENGTH,
  codeKey,
  generateCode,
  resendKey,
  resendWaitMs,
  type VerifyOutcome,
} from './verification-code';
