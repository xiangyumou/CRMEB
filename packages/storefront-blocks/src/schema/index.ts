/**
 * Block prop schemas, the page document and `LinkTarget`.
 *
 * DRAFT — everything under `src/schema/` moves to `@shop/contracts` in stream
 * F1 (the contracts own the data model, plan §2.1). It lives here for the S3
 * spike only. Imports nothing but zod, so it is safe for the server, the admin
 * and the mini-program alike.
 */
export * from './carousel';
export * from './common';
export * from './constants';
export * from './document';
export * from './image-cube';
export * from './link';
export * from './meta';
export * from './product-grid';
