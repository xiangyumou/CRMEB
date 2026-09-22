import type { SmsMessage, SmsSendResult, SmsSender } from './sms.port';

/**
 * An in-memory sender for tests and for a staging box with no SMS account.
 *
 * It lives in `core` rather than in `@shop/testing` because
 * `packages/testing/**` belongs to the orchestrator and a stream may not add to
 * it; nothing outside a test ever registers it, and registering it is an
 * explicit call, not a config value.
 */

export interface FakeSmsSender extends SmsSender {
  readonly sent: SmsMessage[];
  /** The code of the last message to this number, dug out of `params`. */
  lastCodeFor(phone: string): string | undefined;
  reset(): void;
  /** Make the next `n` sends fail, to exercise the "provider refused" path. */
  failNext(count?: number, result?: Partial<SmsSendResult>): void;
}

export function fakeSmsSender(): FakeSmsSender {
  const sent: SmsMessage[] = [];
  let failures = 0;
  let failureResult: Partial<SmsSendResult> = {};
  let counter = 0;

  return {
    name: 'fake',
    sent,
    send(message) {
      if (failures > 0) {
        failures -= 1;
        return Promise.resolve({
          ok: false,
          providerCode: 'FAKE_FAILURE',
          error: '短信发送失败（测试）',
          ...failureResult,
        });
      }
      sent.push(message);
      counter += 1;
      return Promise.resolve({ ok: true, messageId: `fake-${counter}` });
    },
    lastCodeFor(phone) {
      for (let i = sent.length - 1; i >= 0; i -= 1) {
        const message = sent[i];
        if (message && message.phone === phone) return message.params.code;
      }
      return undefined;
    },
    reset() {
      sent.length = 0;
      failures = 0;
      failureResult = {};
    },
    failNext(count = 1, result = {}) {
      failures = count;
      failureResult = result;
    },
  };
}
