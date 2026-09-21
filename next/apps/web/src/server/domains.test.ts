import { describe, expect, it } from 'vitest';
import { getEffectHandler } from '@shop/core/effects';
import { peekCatalogPort } from '@shop/core/order';
import {
  getOrderFacts,
  getOrderStateMachine,
  getPaymentPort,
  getStockPort,
} from '@shop/core/order/ports';

// The thing under test: importing `handle.ts` must be enough, because every
// route module goes through it and nothing else in the web app is guaranteed to
// run at boot.
import './handle';

/**
 * CR-8-c. A Next route module imports only the domain it serves, so before
 * `@shop/core/domains` existed:
 *
 *  - the checkout route never loaded `@shop/core/catalog` and silently ran on
 *    B1's fallback catalogue adapter, and the cancel route saw no `PaymentPort`
 *    and skipped the payment guard entirely with a debug log;
 *  - `system.dispatchEffects` claimed `refund.execute` with no handler
 *    registered and parked it as `unknown`, permanently — a refund approved
 *    just before a deploy, with the buyer waiting.
 *
 * Both failures are silent at build time, which is why they are asserted here.
 */
describe('importing handle.ts installs every domain', () => {
  it('registers the real catalogue ports, not the fallback adapters', () => {
    expect(peekCatalogPort()).toBeDefined();
    expect(() => getStockPort()).not.toThrow();
    expect(() => getOrderFacts()).not.toThrow();
    expect(() => getOrderStateMachine()).not.toThrow();
  });

  it('registers the PaymentPort the cancel path guards with', () => {
    expect(() => getPaymentPort()).not.toThrow();
  });

  it('registers the effect handlers the dispatcher would otherwise park', () => {
    expect(getEffectHandler('refund', 'refund.execute')).toBeDefined();
    expect(getEffectHandler('payment', 'payment.exception.refund')).toBeDefined();
  });
});
