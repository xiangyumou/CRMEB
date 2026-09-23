/**
 * The block prop schemas, the page document and `LinkTarget`.
 *
 * These moved to `@shop/contracts/decor/*` (stream F1; the contracts own the
 * data model, plan §2.1). This entry re-exports them for the editor, under the
 * S3 names it already uses, and narrows `BLOCKS` / `BlockType` to the types
 * this package renders. It carries zod: a client bundle never imports it (the
 * blocks import only types, plus the zod-free `decor/constants`).
 */
import type { z } from 'zod';

import {
  carouselBlock,
  decorBlocks,
  imageCubeBlock,
  productGridBlock,
} from '@shop/contracts/decor/all-blocks';
import {
  checkDocument,
  type DocumentIssue,
  type PageDocument,
} from '@shop/contracts/decor/document';

export * from '@shop/contracts/decor/base';
export * from '@shop/contracts/decor/all-blocks';
export * from '@shop/contracts/decor/constants';
export * from '@shop/contracts/decor/document';
export * from '@shop/contracts/decor/link';
export * from '@shop/contracts/decor/link-route';
export * from '@shop/contracts/decor/meta';
export * from '@shop/contracts/decor/registry';
export * from '@shop/contracts/decor/sources';

/** The block types this package has a component for, in palette order. */
export const BLOCKS = {
  carousel: { label: carouselBlock.meta.label, v: carouselBlock.v, props: carouselBlock.props },
  productGrid: {
    label: productGridBlock.meta.label,
    v: productGridBlock.v,
    props: productGridBlock.props,
  },
  imageCube: { label: imageCubeBlock.meta.label, v: imageCubeBlock.v, props: imageCubeBlock.props },
} as const;

export type BlockType = keyof typeof BLOCKS;

export const BLOCK_TYPES = Object.keys(BLOCKS) as BlockType[];

export function isBlockType(type: string): type is BlockType {
  return Object.hasOwn(BLOCKS, type);
}

export type BlockPropsOf<T extends BlockType> = z.infer<(typeof BLOCKS)[T]['props']>;

export type ValidatedDocument =
  | { ok: true; document: PageDocument; unknownBlocks: string[] }
  | { ok: false; issues: DocumentIssue[] };

/**
 * The S3 editor's check: `checkDocument` against every registered block type,
 * collapsed to ok / issues, except that an unknown type is tolerated (reported
 * in `unknownBlocks`) rather than an issue.
 */
export function validatePageDocument(input: unknown): ValidatedDocument {
  const result = checkDocument(input, { registry: decorBlocks });
  if (!result.ok) return result;
  const issues = result.issues.filter(
    (issue) => !result.warnings.some((warning) => warning.path === issue.path),
  );
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    document: result.document as PageDocument,
    unknownBlocks: result.unknownBlocks,
  };
}
