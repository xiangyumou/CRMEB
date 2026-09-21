import type { ConfigFieldDescriptor } from '@shop/contracts/system/schemas';

/**
 * Local adapter for UI metadata `ConfigFieldUi` does not carry yet.
 *
 * The kernel's `ConfigFieldUi` (orchestrator-owned, `kernel/config-registry.ts`)
 * has `label`, `type`, `help`, `placeholder`, `options`, `section`, `secret` and
 * `order` — but no conditional visibility, and the admin kit's
 * `<ConfigGroupForm>` has supported a data-only `visibleWhen` since P0-b. A
 * storage screen that shows seven S3 fields while the driver is `local` is the
 * thing this exists to avoid.
 *
 * **CR-1-f1** asks for `visibleWhen` to move onto `ConfigFieldUi`. Until it
 * lands, a group registers the extra here next to its `defineConfigGroup` call
 * and `describeGroup` merges it in. When the CR lands, delete this file and the
 * calls to it; nothing else changes.
 */

export interface ConfigFieldExtra {
  visibleWhen?: NonNullable<ConfigFieldDescriptor['visibleWhen']>;
}

const extras = new Map<string, ConfigFieldExtra>();

/** Registers extras for one group. Keys are field names of that group. */
export function defineConfigFieldExtras(
  group: string,
  map: Record<string, ConfigFieldExtra>,
): void {
  for (const [key, extra] of Object.entries(map)) extras.set(`${group}.${key}`, extra);
}

export function configFieldExtra(group: string, key: string): ConfigFieldExtra | undefined {
  return extras.get(`${group}.${key}`);
}
