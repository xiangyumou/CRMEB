/**
 * What an editor needs to read before it can write.
 *
 * The product editor fills its selects from 分类, 标签, 保障, 参数模板 and 运费模板,
 * uploads its pictures through 素材, and cannot save without a 分类. A role given
 * `catalog:product:write` alone opened an editor of 403s. So a role that is given
 * one of these atoms is given what it reads as well — **when the role is saved**,
 * as ordinary rows the role editor shows ticked. The check in `rbac.ts` stays
 * "is the atom in the set": nothing here is an implication at check time.
 *
 * Only reads (and 素材 upload, which is how an editor puts a picture in) are
 * listed, and none of them requires anything in turn, so one pass is the whole
 * closure. Migration 0013 applied this table to the roles that existed then; a
 * change here is a change to the next migration too, and the test that reads
 * 0013 back says so.
 */

const STORAGE_FOR_EDITORS = [
  'storage:attachment:read',
  'storage:attachment:write',
  'storage:category:read',
] as const;

export const PERMISSION_REQUIREMENTS: Readonly<Record<string, readonly string[]>> = {
  'catalog:product:write': [
    'catalog:product:read',
    'catalog:category:read',
    'catalog:label:read',
    'catalog:protection:read',
    'catalog:param:read',
    'shipping:template:read',
    ...STORAGE_FOR_EDITORS,
  ],
  'catalog:category:write': ['catalog:category:read', ...STORAGE_FOR_EDITORS],
  'cms:article:write': ['cms:article:read', 'catalog:product:read', ...STORAGE_FOR_EDITORS],
  'cms:category:write': ['cms:article:read', ...STORAGE_FOR_EDITORS],
  'groupbuy:activity:write': [
    'groupbuy:activity:read',
    'catalog:product:read',
    ...STORAGE_FOR_EDITORS,
  ],
  'presale:activity:write': [
    'presale:activity:read',
    'catalog:product:read',
    ...STORAGE_FOR_EDITORS,
  ],
  // The page editor's pickers: a block can link to any of these.
  'decor:page:write': [
    'decor:page:read',
    'catalog:product:read',
    'catalog:category:read',
    'catalog:label:read',
    'cms:article:read',
    'coupon:template:read',
    'groupbuy:activity:read',
    'presale:activity:read',
    ...STORAGE_FOR_EDITORS,
  ],
};

export function requirementsOf(atom: string): readonly string[] {
  return PERMISSION_REQUIREMENTS[atom] ?? [];
}

/** The atoms plus everything they require, sorted and without repeats. */
export function withRequirements(atoms: readonly string[]): string[] {
  return [...new Set(atoms.flatMap((atom) => [atom, ...requirementsOf(atom)]))].sort();
}
