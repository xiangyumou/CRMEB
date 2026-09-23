import {
  fixtureHotspotImage,
  fixtureNavGrid,
  fixtureNotice,
  fixtureOrderEntry,
  fixtureProductTabs,
  fixtureRichText,
  fixtureSearchBar,
  fixtureServiceGrid,
  fixtureSpacer,
  fixtureTitleBar,
  fixtureUserCard,
  resolveFixtureProducts,
} from '@shop/storefront-blocks/fixtures';
import type { DataNeed } from '@shop/contracts/decor/sources';
import { BLOCKS, decorBlocks, type BlockType } from '@shop/storefront-blocks/schema';
import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { renderAdmin } from '@/test/render';

import { DecorCanvasDataProvider, type DecorCanvasData } from './canvas-data';
import { buildDecorConfig, newBlockProps } from './config';
import { SEMANTIC_FIELD_KINDS, zodToPuckFields, type CustomFieldRenderers } from './zod-to-puck';

/** The batch-1 blocks in the editor canvas (React 19, the prebuilt admin bundle). */

const noField = (() => null) as never;
const custom = {
  ...Object.fromEntries(SEMANTIC_FIELD_KINDS.map((kind) => [kind, noField])),
  multiChoice: noField,
} as unknown as CustomFieldRenderers;

const config = buildDecorConfig({ kind: 'custom', custom });

const canvasData: DecorCanvasData = {
  resolve: async (need: DataNeed) =>
    need.kind === 'products' ? resolveFixtureProducts(need.source) : null,
};

function renderBlock(type: string, props: unknown): ReactElement {
  const component = config.components[type];
  if (!component) throw new Error(`no component ${type}`);
  const Render = component.render as (props: Record<string, unknown>) => ReactElement;
  return <Render id={`${type}-1`} puck={{ isEditing: true }} editMode {...(props as object)} />;
}

describe('the editor palette', () => {
  it('offers every registered block', () => {
    expect(
      Object.keys(config.components)
        .filter((type) => decorBlocks.get(type))
        .sort(),
    ).toEqual([...decorBlocks.types].sort());
  });

  it('gives the rich-text and hotspot props their own controls', () => {
    const rich = zodToPuckFields(BLOCKS.richText.props, custom);
    expect(rich.html).toMatchObject({ type: 'custom', label: '内容', render: custom.richText });
    const hot = zodToPuckFields(BLOCKS.hotspotImage.props, custom);
    expect(hot.hotspots).toMatchObject({ type: 'custom', label: '热区', render: custom.hotspots });
  });

  it('starts every block with props its schema accepts once the pictures are picked', () => {
    for (const type of Object.keys(BLOCKS) as BlockType[]) {
      const props = newBlockProps(decorBlocks.get(type)!);
      const result = BLOCKS[type].props.safeParse(props);
      // Only what the operator has to supply — a picture, an entry's text or link —
      // may keep a new block invalid; never a missing array item or a bad default.
      const blocking = result.success
        ? []
        : result.error.issues.filter(
            (issue) => !/^(image|icon|label|text|link)$/.test(String(issue.path.at(-1) ?? '')),
          );
      expect(blocking, type).toEqual([]);
    }
  });
});

describe('the batch-1 blocks on the canvas', () => {
  it('draws the content blocks through the DOM shim', () => {
    const blocks: [string, unknown][] = [
      ['searchBar', fixtureSearchBar],
      ['navGrid', fixtureNavGrid],
      ['notice', fixtureNotice],
      ['hotspotImage', fixtureHotspotImage],
      ['titleBar', fixtureTitleBar],
      ['richText', fixtureRichText],
      ['spacer', fixtureSpacer],
    ];
    for (const [type, props] of blocks) {
      const { container, unmount } = renderAdmin(renderBlock(type, props));
      expect(container.querySelector(`[data-block="${type}"]`), type).not.toBeNull();
      unmount();
    }
  });

  it('fills each 商品选项卡 tab from the canvas products', async () => {
    renderAdmin(
      <DecorCanvasDataProvider value={canvasData}>
        {renderBlock('productTabs', fixtureProductTabs)}
      </DecorCanvasDataProvider>,
    );
    expect(screen.getByText('推荐')).toBeInTheDocument();
    expect(await screen.findByText('厨房收纳三件套')).toBeInTheDocument();
  });

  it('draws the 个人中心 blocks as a guest sees them, with no shopper state', () => {
    renderAdmin(
      <>
        {renderBlock('userCard', fixtureUserCard)}
        {renderBlock('orderEntry', fixtureOrderEntry)}
        {renderBlock('serviceGrid', fixtureServiceGrid)}
      </>,
    );
    expect(screen.getByText('登录 / 注册')).toBeInTheDocument();
    expect(screen.getByText('待付款')).toBeInTheDocument();
    expect(screen.getByText('联系客服')).toBeInTheDocument();
  });

  it('never lets rich text out of the allow-list on the canvas either', () => {
    const { container } = renderAdmin(
      renderBlock('richText', {
        ...fixtureRichText,
        html: '<p>ok</p><script>window.pwned = 1</script><img src="x" onerror="alert(1)">',
      }),
    );
    expect(container.querySelector('script, img')).toBeNull();
    expect(container.querySelector('[data-block="richText"]')?.textContent).toBe('ok');
  });
});
