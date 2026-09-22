import type { z } from 'zod';
import { allRoutes } from '@shop/contracts/routes';
import { allConfigGroups } from '@shop/core/kernel';
import { defineCheck, fail, result, type Finding } from '../framework';
import '../lib/install-domains';

/**
 * SYS-004/SYS-006, walked over the contracts instead of trusted.
 *
 * A config field marked `secret` (or typed `password`) travels to the browser
 * as an "is set" boolean and never as text. The service enforces that; this
 * guard proves that **no response schema anywhere can carry it as text**, which
 * is the property a future route could break without touching `system`.
 *
 * The walk is over the zod schemas themselves, not over the OpenAPI document,
 * because the document flattens unions and drops what it cannot express.
 */

interface SecretField {
  group: string;
  key: string;
  why: string;
}

function secretFields(): SecretField[] {
  const out: SecretField[] = [];
  for (const group of allConfigGroups()) {
    for (const [key, ui] of Object.entries(group.ui)) {
      if (!ui) continue;
      if (ui.secret === true || ui.type === 'password') {
        out.push({ group: group.group, key, why: ui.label });
      }
    }
  }
  return out;
}

/** Every `(path, zod type)` pair reachable in a schema, depth-limited by the cycle set. */
function walkSchema(
  schema: z.ZodType,
  visit: (propertyPath: string[], node: z.ZodType) => void,
): void {
  const seen = new Set<z.ZodType>();
  const go = (node: z.ZodType, at: string[]): void => {
    if (seen.has(node)) return;
    seen.add(node);
    visit(at, node);
    const def = node.def as { type?: string } & Record<string, unknown>;
    switch (def.type) {
      case 'object': {
        const shape = (node as unknown as z.ZodObject).shape as Record<string, z.ZodType>;
        for (const [key, child] of Object.entries(shape)) go(child, [...at, key]);
        return;
      }
      case 'array':
        go((def.element ?? def.type) as z.ZodType, [...at, '[]']);
        return;
      case 'record': {
        const value = def.valueType as z.ZodType | undefined;
        if (value) go(value, [...at, '*']);
        return;
      }
      case 'union': {
        for (const option of (def.options ?? []) as z.ZodType[]) go(option, at);
        return;
      }
      case 'optional':
      case 'nullable':
      case 'default':
      case 'catch':
      case 'readonly':
      case 'nonoptional': {
        const inner = def.innerType as z.ZodType | undefined;
        if (inner) go(inner, at);
        return;
      }
      case 'pipe': {
        const out = def.out as z.ZodType | undefined;
        if (out) go(out, at);
        return;
      }
      case 'lazy':
        return; // recursive DIY node tree: free-form jsonb, no config key lives there
      default:
        return;
    }
  };
  go(schema, []);
}

function isBooleanish(node: z.ZodType): boolean {
  const type = (node.def as { type?: string }).type;
  return type === 'boolean';
}

export const secretsNeverLeak = defineCheck(
  'secrets',
  'no secret config field is readable through a response schema',
  () => {
    const fields = secretFields();
    const byKey = new Map(fields.map((f) => [f.key, f]));
    const findings: Finding[] = [];
    let properties = 0;

    for (const route of allRoutes) {
      walkSchema(route.response as z.ZodType, (at, node) => {
        properties += 1;
        const key = at.at(-1);
        if (key === undefined) return;
        const field = byKey.get(key);
        if (!field) return;
        if (isBooleanish(node)) return; // the "is set" flag: that is the contract
        findings.push(
          fail(
            route.id,
            `response.${at.join('.')} is the secret config field ${field.group}.${field.key} (${field.why}) and is not a boolean — a secret may only travel as "is set"`,
          ),
        );
      });
    }

    // A group that marks nothing secret while holding something that is plainly a
    // credential is the other half of SYS-006; the unit test in `system.test.ts`
    // owns that, so here we only assert the set is not empty — an empty set would
    // make this whole check vacuously green.
    if (fields.length === 0) {
      findings.push(
        fail(
          'packages/core/src/**/*.config.ts',
          'no config field is marked secret at all — the walk would pass vacuously',
        ),
      );
    }

    return result(
      'secrets',
      'secret config fields',
      `${fields.length} secret fields in ${allConfigGroups().length} groups against ${properties} response schema nodes in ${allRoutes.length} contracts`,
      findings,
    );
  },
);
