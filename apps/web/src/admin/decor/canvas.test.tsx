import {
  fixtureCarousel,
  fixtureImageCube,
  fixtureProductGrid,
} from '@shop/storefront-blocks/fixtures';
import { resolveFixtureProducts } from '@shop/storefront-blocks/fixtures';
import { render, screen } from '@testing-library/react';
import { version } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { buildDecorConfig, DecorCanvasDataProvider } from './config';
import type { CustomFieldRenderers } from './zod-to-puck';

/**
 * The editor canvas renders the storefront's own blocks — the prebuilt
 * `@shop/storefront-blocks/admin` bundle, Taro components swapped for the DOM
 * shim — on the admin's React 19. (The package's own tests run the same
 * blocks on React 18.)
 */

const noField = (() => null) as never;
const custom: CustomFieldRenderers = {
  image: noField,
  link: noField,
  color: noField,
  productSource: noField,
};

const config = buildDecorConfig(custom);

function renderBlock(type: string, props: Record<string, unknown>): ReactElement {
  const component = config.components[type];
  if (!component) throw new Error(`no component ${type}`);
  const Render = component.render as (props: Record<string, unknown>) => ReactElement;
  return <Render id={`${type}-1`} puck={{ isEditing: true }} editMode {...props} />;
}

describe('decor canvas', () => {
  it('runs on the admin React', () => {
    expect(version.split('.')[0]).toBe('19');
  });

  it('draws a carousel through the DOM shim, one aspectFill image per slide', () => {
    const { container } = render(renderBlock('carousel', fixtureCarousel));
    expect(container.querySelector('[data-block="carousel"]')).not.toBeNull();
    expect(container.querySelectorAll('.sbd-swiper-item')).toHaveLength(3);
    expect(container.querySelectorAll('.sbd-image--aspectFill')).toHaveLength(3);
    expect(screen.getByAltText('秋季上新')).toBeInTheDocument();
  });

  it('draws a product grid from the products the page supplies', () => {
    render(
      <DecorCanvasDataProvider value={{ products: resolveFixtureProducts }}>
        {renderBlock('productGrid', fixtureProductGrid)}
      </DecorCanvasDataProvider>,
    );
    expect(screen.getByText('云南古树普洱茶饼 357g')).toBeInTheDocument();
    expect(screen.getByText('新品')).toBeInTheDocument();
  });

  it('draws an image cube in its layout', () => {
    const { container } = render(renderBlock('imageCube', fixtureImageCube));
    expect(container.querySelector('[data-block="imageCube"]')).not.toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(3);
  });

  it('shows a notice instead of crashing on props it cannot draw', () => {
    render(renderBlock('imageCube', { ...fixtureImageCube, cells: null, style: null }));
    expect(screen.getByText('图片魔方：当前配置无法预览')).toBeInTheDocument();
  });
});
