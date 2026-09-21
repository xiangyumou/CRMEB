/**
 * `@shop/etl` — the one-shot MySQL → PostgreSQL migration.
 *
 * Only mappers so far (see `README.md`). Each domain exports its own from
 * `src/mappers/<domain>.ts`; this file is the index the runner will import,
 * and is deliberately the *only* shared file, so streams adding a mapper
 * conflict on one line each.
 */
export * as coupon from './mappers/coupon';
export * as diy from './mappers/diy';
