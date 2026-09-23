import { z } from 'zod';

/**
 * Makes zod speak Simplified Chinese.
 *
 * Error messages are human-readable, Simplified Chinese and safe to show to the
 * end user (`docs/conventions.md`). A 422 body carries per-field messages
 * straight from zod, so without this every validation failure would show the
 * shopper "Invalid input: expected string, received undefined".
 *
 * Importing this module is the whole API — it configures the global zod
 * instance. Anything that turns a `ZodError` into a response imports it:
 * `handle()` in apps/web, and the mock server. A domain that wants a better
 * message than the generic one still passes its own to the schema.
 */
z.config(z.locales.zhCN());

export const zodLocale = 'zh-CN';
