'use client';

import type { Config, Data } from '@puckeditor/core';
import { Carousel, ImageCube, ProductGrid } from '@shop/storefront-blocks/admin';
import {
  BLOCKS,
  IMAGE_CUBE_LAYOUTS,
  carouselSlide,
  imageCubeCell,
  pageRootProps,
  type BlockType,
  type CarouselProps,
  type ImageCubeProps,
  type PageRootProps,
  type ProductGridProps,
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

function ProductGridCanvas({ props }: { props: ProductGridProps }) {
  const data = useContext(DecorCanvasDataContext);
  const products = data.products(props.source) ?? [];
  return <ProductGrid props={props} data={{ products: [...products] }} />;
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
  const base = defaultsOf(BLOCKS[type].props) as Record<string, unknown>;
  switch (type) {
    case 'carousel':
      return { ...base, slides: [defaultsOf(carouselSlide)] };
    case 'imageCube':
      return { ...base, cells: cellsFor((base as ImageCubeProps).layout) };
    default:
      return base;
  }
}

// ─── the config ──────────────────────────────────────────────────────────────

function blockRender(type: BlockType): (props: Record<string, unknown>) => ReactElement {
  const label = BLOCKS[type].label;
  switch (type) {
    case 'carousel':
      return function CarouselBlock(props) {
        const own = ownProps<CarouselProps>(props);
        return (
          <BlockBoundary label={label} watch={own}>
            <Carousel props={own} />
          </BlockBoundary>
        );
      };
    case 'productGrid':
      return function ProductGridBlock(props) {
        const own = ownProps<ProductGridProps>(props);
        return (
          <BlockBoundary label={label} watch={own}>
            <ProductGridCanvas props={own} />
          </BlockBoundary>
        );
      };
    case 'imageCube':
      return function ImageCubeBlock(props) {
        const own = ownProps<ImageCubeProps>(props);
        return (
          <BlockBoundary label={label} watch={own}>
            <ImageCube props={own} />
          </BlockBoundary>
        );
      };
  }
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
