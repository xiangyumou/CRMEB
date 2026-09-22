/**
 * `@shop/etl` — the one-shot MySQL → PostgreSQL migration.
 *
 * Only mappers so far (see `README.md`). Each domain exports its own from
 * `src/mappers/<domain>.ts`; this file is the index the runner will import,
 * and is deliberately the *only* shared file, so streams adding a mapper
 * conflict on one line each.
 */
export * as catalog from './mappers/catalog';
export * as coupon from './mappers/coupon';
export * as diy from './mappers/diy';
export * as groupbuy from './mappers/groupbuy';
export * as notification from './mappers/notification';
export * as storage from './mappers/storage';
export * as system from './mappers/system';
export * as user from './mappers/user';
