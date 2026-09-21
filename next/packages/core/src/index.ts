/**
 * `@shop/core` — the domain layer.
 *
 * The root export is deliberately thin: the kernel, the auth services, the
 * effects ledger and the order ports. A domain is reached through its own
 * subpath (`@shop/core/catalog`), never from here, so that ten streams adding
 * domains in parallel never touch this file.
 */
export * from './kernel';
export * as auth from './auth';
export * as effects from './effects';
export * as orderPorts from './order/ports';
