import { z } from 'zod';

import { carouselProps } from './carousel';
import { color } from './common';
import { imageCubeProps } from './image-cube';
import { ui } from './meta';
import { productGridProps } from './product-grid';

/**
 * The DIY v2 page document (plan §2.1). DRAFT — moves to `@shop/contracts` in
 * stream F1.
 *
 * ```
 * PageDocument = { schemaVersion: 2, root: { props }, blocks: Block[] }
 * Block        = { id, type, v, props }
 * ```
 *
 * `v` is the block's own schema version; migrations are per block type and
 * live next to the schema. The editor always writes the current version.
 */

export const BLOCKS = {
  carousel: { label: '轮播', v: 1, props: carouselProps },
  productGrid: { label: '商品网格', v: 1, props: productGridProps },
  imageCube: { label: '图片魔方', v: 1, props: imageCubeProps },
} as const;

export type BlockType = keyof typeof BLOCKS;

export const BLOCK_TYPES = Object.keys(BLOCKS) as BlockType[];

export function isBlockType(type: string): type is BlockType {
  return Object.hasOwn(BLOCKS, type);
}

export type BlockPropsOf<T extends BlockType> = z.infer<(typeof BLOCKS)[T]['props']>;

export const pageRootProps = z.object({
  title: z
    .string()
    .min(1)
    .max(30)
    .default('微页面')
    .meta(ui({ label: '页面标题' })),
  background: color.default('#f5f5f5').meta(ui({ label: '页面背景色' })),
  shareTitle: z
    .string()
    .max(40)
    .default('')
    .meta(ui({ label: '分享标题' })),
});

export type PageRootProps = z.infer<typeof pageRootProps>;

/**
 * The envelope. Block props are validated per type by `validatePageDocument`,
 * not here, so a document holding a block type this build does not know still
 * parses: an older client skips it rather than failing the page (plan §2.1).
 */
export const pageBlock = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(40),
  v: z.number().int().positive(),
  props: z.record(z.string(), z.unknown()),
});

export type PageBlock = z.infer<typeof pageBlock>;

export const pageDocument = z.object({
  schemaVersion: z.literal(2),
  root: z.object({ props: pageRootProps }),
  blocks: z.array(pageBlock).max(60),
});

export type PageDocument = z.infer<typeof pageDocument>;

export interface DocumentIssue {
  /** `blocks.2.props.slides.0.image` */
  path: string;
  message: string;
}

export type ValidatedDocument =
  | { ok: true; document: PageDocument; unknownBlocks: string[] }
  | { ok: false; issues: DocumentIssue[] };

function toIssues(error: z.ZodError, prefix: (string | number)[]): DocumentIssue[] {
  return error.issues.map((issue) => ({
    path: [...prefix, ...issue.path].map(String).join('.'),
    message: issue.message,
  }));
}

/**
 * Parses the envelope, then every known block's props against its schema (at
 * its current version). Unknown block types pass through untouched and are
 * reported, so the caller can decide: the editor warns, a client skips them.
 * The returned document carries the *parsed* props (defaults filled in).
 */
export function validatePageDocument(input: unknown): ValidatedDocument {
  const envelope = pageDocument.safeParse(input);
  if (!envelope.success) return { ok: false, issues: toIssues(envelope.error, []) };

  const issues: DocumentIssue[] = [];
  const unknownBlocks: string[] = [];
  const ids = new Set<string>();
  const blocks = envelope.data.blocks.map((block, index) => {
    if (ids.has(block.id)) {
      issues.push({ path: `blocks.${index}.id`, message: `块 id 重复：${block.id}` });
    }
    ids.add(block.id);
    if (!isBlockType(block.type)) {
      unknownBlocks.push(block.type);
      return block;
    }
    const spec = BLOCKS[block.type];
    if (block.v !== spec.v) {
      issues.push({
        path: `blocks.${index}.v`,
        message: `${spec.label} 的版本 ${block.v} 需要先迁移到 ${spec.v}`,
      });
      return block;
    }
    const props = spec.props.safeParse(block.props);
    if (!props.success) {
      issues.push(...toIssues(props.error, ['blocks', index, 'props']));
      return block;
    }
    return { ...block, props: props.data as Record<string, unknown> };
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, document: { ...envelope.data, blocks }, unknownBlocks };
}
