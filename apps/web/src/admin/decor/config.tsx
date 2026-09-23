'use client';

import type { Config, Data } from '@puckeditor/core';
import { BLOCK_COMPONENTS } from '@shop/storefront-blocks/admin';
import {
  BLOCKS,
  IMAGE_CUBE_LAYOUTS,
  carouselSlide,
  decorBlocks,
  imageCubeCell,
  pageRootProps,
  type BlockType,
  type ImageCubeProps,
  type PageRootProps,
  type ProductSource,
  type ProductSummary,
} from '@shop/storefront-blocks/schema';
import {
  Component,
  createContext,
  useContext,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react';

import { z } from 'zod';

import { defaultsOf, zodToPuckFields, type CustomFieldRenderers } from './zod-to-puck';

/**
 * The Puck `Config` for the DIY v2 blocks: one component per `BLOCKS` entry,
 * fields generated from its zod schema, rendered by the *storefront's own*
 * block through the DOM shim (`@shop/storefront-blocks/admin`). Nothing about
 * a block is written twice for the editor.
 */

// ─── data the canvas needs ───────────────────────────────────────────────────

/**
 * Where the canvas gets the data a block does not carry: a product grid holds
 * a *source* (ids or a category), and the storefront gets the products from
 * the page resolver. In the editor the page supplies this.
 */
export interface DecorCanvasData {
  products(source: ProductSource): readonly ProductSummary[] | undefined;
}

const DecorCanvasDataContext = createContext<DecorCanvasData>({ products: () => undefined });

export function DecorCanvasDataProvider({
  value,
  children,
}: {
  value: DecorCanvasData;
  children: ReactNode;
}) {
  return <DecorCanvasDataContext value={value}>{children}</DecorCanvasDataContext>;
}

// ─── rendering ───────────────────────────────────────────────────────────────

/**
 * A block with half-edited props (a cleared number, a layout with too few
 * cells) must not take the whole canvas down: it draws a notice instead and
 * recovers on the next edit.
 */
class BlockBoundary extends Component<
  { label: string; watch: unknown; children: ReactNode },
  { failed: boolean; watched: unknown }
> {
  override state = { failed: false, watched: this.props.watch };

  static getDerivedStateFromError(): Partial<{ failed: boolean }> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { watch: unknown },
    state: { failed: boolean; watched: unknown },
  ): Partial<{ failed: boolean; watched: unknown }> | null {
    return props.watch === state.watched ? null : { failed: false, watched: props.watch };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(`[decor] ${this.props.label} failed to render`, error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div style={{ padding: 12, color: '#999', fontSize: 12, background: '#fafafa' }}>
          {this.props.label}：当前配置无法预览
        </div>
      );
    }
    return this.props.children;
  }
}

/** Puck adds `id`, `puck` and `editMode` to a component's props; the block wants its own only. */
function ownProps<P>(props: Record<string, unknown>): P {
  const { id: _id, puck: _puck, editMode: _editMode, ...own } = props;
  return own as P;
}

/**
 * What a block's `data` asks the resolver for, answered from the canvas data
 * instead: products for each `products` need (a 商品列表's `products`, a
 * 商品选项卡's `tab0`…). Other kinds have no canvas source yet and stay
 * empty, which the blocks draw as empty.
 */
function useCanvasBlockData(type: BlockType, props: unknown): Record<string, unknown> | undefined {
  const canvas = useContext(DecorCanvasDataContext);
  const needs = decorBlocks.get(type)?.data?.(props as never);
  if (!needs) return undefined;
  const out: Record<string, unknown> = {};
  for (const [slot, need] of Object.entries(needs)) {
    if (need.kind === 'products') out[slot] = [...(canvas.products(need.source) ?? [])];
  }
  return out;
}

function CanvasBlock({ type, props }: { type: BlockType; props: unknown }) {
  const Block = BLOCK_COMPONENTS[type];
  const data = useCanvasBlockData(type, props);
  return <Block props={props} data={data} />;
}

// ─── defaults for a newly inserted block ─────────────────────────────────────

function cellsFor(layout: keyof typeof IMAGE_CUBE_LAYOUTS): unknown[] {
  return Array.from({ length: IMAGE_CUBE_LAYOUTS[layout].cells }, () => defaultsOf(imageCubeCell));
}

/**
 * The props a block starts with when dropped on the page. Schema defaults,
 * plus the minimum item count an array needs; images start empty, so the
 * document is invalid until the operator picks them — by design.
 */
export function newBlockProps(type: BlockType): Record<string, unknown> {
  const schema = BLOCKS[type].props as z.ZodObject;
  const base = defaultsOf(schema) as Record<string, unknown>;
  switch (type) {
    case 'carousel':
      return { ...base, slides: [defaultsOf(carouselSlide)] };
    case 'imageCube':
      return { ...base, cells: cellsFor((base as ImageCubeProps).layout) };
    default:
      return { ...base, ...minimumItems(schema, base) };
  }
}

/** A top-level array with `.min(n)` and nothing in it starts with n default items. */
function minimumItems(
  schema: z.ZodObject,
  base: Record<string, unknown>,
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    if (!(field instanceof z.ZodArray)) continue;
    const checks = (field._zod.def.checks ?? []) as unknown as readonly {
      _zod: { def: { check: string; minimum?: number } };
    }[];
    const minimum = Math.max(
      0,
      ...checks.map((check) =>
        check._zod.def.check === 'min_length' ? (check._zod.def.minimum ?? 0) : 0,
      ),
    );
    const current = Array.isArray(base[key]) ? base[key] : [];
    if (current.length >= minimum) continue;
    out[key] = Array.from({ length: minimum }, () => defaultsOf(field.element as z.ZodType));
  }
  return out;
}

// ─── the config ──────────────────────────────────────────────────────────────

function blockRender(type: BlockType): (props: Record<string, unknown>) => ReactElement {
  const label = BLOCKS[type].label;
  return function DecorBlock(props) {
    const own = ownProps<unknown>(props);
    return (
      <BlockBoundary label={label} watch={own}>
        <CanvasBlock type={type} props={own} />
      </BlockBoundary>
    );
  };
}

export type DecorData = Data;

export function buildDecorConfig(custom: CustomFieldRenderers): Config {
  const components: Config['components'] = {};
  for (const type of Object.keys(BLOCKS) as BlockType[]) {
    components[type] = {
      label: BLOCKS[type].label,
      fields: zodToPuckFields(BLOCKS[type].props, custom),
      defaultProps: newBlockProps(type),
      render: blockRender(type),
    };
  }
  return {
    components,
    root: {
      fields: zodToPuckFields(pageRootProps, custom),
      defaultProps: defaultsOf(pageRootProps) as PageRootProps,
      render: function PageRoot({
        children,
        background,
      }: {
        children?: ReactNode;
        background?: string;
      }) {
        return <div style={{ background, minHeight: '100vh' }}>{children}</div>;
      },
    },
  };
}
