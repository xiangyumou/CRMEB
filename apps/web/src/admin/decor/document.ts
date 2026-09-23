import type { Data } from '@puckeditor/core';
import {
  BLOCKS,
  isBlockType,
  type PageDocument,
  type PageRootProps,
} from '@shop/storefront-blocks/schema';

/**
 * The DIY v2 page document ⇄ the editor's own data.
 *
 * The document is what is stored and what the storefront renders
 * (`{schemaVersion: 2, root: {props}, blocks: [{id, type, v, props}]}`); Puck's
 * `Data` is an editor detail and never leaves the admin. Keeping the
 * conversion in one place is what makes the editor replaceable.
 *
 * Differences it absorbs:
 *
 * - Puck keeps a block's `id` inside `props`; the document keeps it beside them.
 * - Puck has no block version. The document's `v` is written from `BLOCKS` on
 *   the way out, and a document whose block is at another version is refused
 *   on the way in (it needs a migration first, never a silent re-stamp).
 * - Puck's `zones` (drop zones inside a block) have no document equivalent:
 *   an empty map is dropped, a non-empty one is an error.
 */

export class DecorConversionError extends Error {
  override name = 'DecorConversionError';
}

type PuckContentItem = Data['content'][number];

/** Document → Puck data, for opening a saved page. */
export function toPuckData(document: PageDocument): Data {
  return {
    root: { props: { ...document.root.props } },
    content: document.blocks.map((block): PuckContentItem => {
      if (!isBlockType(block.type)) {
        throw new DecorConversionError(`此编辑器不认识块类型「${block.type}」，请升级后台后再编辑`);
      }
      const expected = BLOCKS[block.type].v;
      if (block.v !== expected) {
        throw new DecorConversionError(
          `${BLOCKS[block.type].label}（${block.id}）的版本 ${block.v} 需要先迁移到 ${expected}`,
        );
      }
      return { type: block.type, props: { ...block.props, id: block.id } };
    }),
  };
}

/**
 * Puck data → document, for saving and previewing. The props are carried
 * over as they are; `validatePageDocument` is what checks them.
 */
export function toPageDocument(data: Data): PageDocument {
  const zones = Object.entries(data.zones ?? {}).filter(([, items]) => items.length > 0);
  if (zones.length > 0) {
    throw new DecorConversionError(
      `页面文档不支持嵌套区域：${zones.map(([key]) => key).join('、')}`,
    );
  }
  const root = data.root as { props?: Record<string, unknown> };
  return {
    schemaVersion: 2,
    root: { props: { ...(root.props ?? {}) } as PageRootProps },
    blocks: data.content.map((item) => {
      if (!isBlockType(item.type)) {
        throw new DecorConversionError(`未知的块类型「${item.type}」`);
      }
      const { id, ...props } = item.props as { id: string } & Record<string, unknown>;
      return { id, type: item.type, v: BLOCKS[item.type].v, props };
    }),
  };
}
