import { fireEvent, screen } from '@testing-library/dom';
import { version } from 'react';
import { version as domVersion } from 'react-dom';
import { afterEach, describe, expect, inject, it, vi } from 'vitest';

import {
  fixtureCarousel,
  fixtureImageCube,
  fixtureImageCubeRow,
  fixtureProductGrid,
  fixtureProducts,
} from '../fixtures';
import { cleanup, render } from '../test/render';
import { BlockList, Carousel, ImageCube, ProductGrid } from './index';

afterEach(cleanup);

/**
 * The three spike blocks, rendered through the DOM shim. This file runs twice:
 * once on React 19 (`unit`) and once on React 18 (`unit-react18`).
 */

describe('the React the blocks render with', () => {
  it('is the one this Vitest project is for', () => {
    expect(version.split('.')[0]).toBe(inject('reactMajor'));
    expect(domVersion.split('.')[0]).toBe(inject('reactMajor'));
  });
});

describe('Carousel', () => {
  it('renders a slide per image, fitted aspectFill, with WeChat-style dots', () => {
    const { container } = render(<Carousel props={fixtureCarousel} />);
    const block = container.querySelector('[data-block="carousel"]');
    expect(block).not.toBeNull();
    const slides = container.querySelectorAll('.sbd-swiper-item');
    expect(slides).toHaveLength(3);
    const images = container.querySelectorAll('.sbd-image');
    expect([...images].every((image) => image.classList.contains('sbd-image--aspectFill'))).toBe(
      true,
    );
    const dots = container.querySelectorAll<HTMLElement>('.sbd-swiper__dot');
    expect(dots).toHaveLength(3);
    // #ffffff80 reaches the native attribute as rgba, which every base library takes.
    expect(dots[1]?.style.background).toMatch(/rgba\(255, 255, 255, 0\.502\)/);
    expect(dots[0]?.style.background).toMatch(/rgb\(255, 255, 255\)|#ffffff/);
    // The design height travels as a unitless custom property the stylesheet scales.
    const swiper = container.querySelector<HTMLElement>('.sbd-swiper');
    expect(swiper?.style.getPropertyValue('--sb-height')).toBe('340');
  });

  it('reports the typed link of the tapped slide', () => {
    const onLink = vi.fn();
    const { container } = render(<Carousel props={fixtureCarousel} onLink={onLink} />);
    const second = container.querySelectorAll('.sbd-image')[1];
    fireEvent.click(second as Element);
    expect(onLink).toHaveBeenCalledWith({ kind: 'product', id: '12' });
  });

  it('hides the dots for a single slide or when turned off', () => {
    const one = render(
      <Carousel props={{ ...fixtureCarousel, slides: fixtureCarousel.slides.slice(0, 1) }} />,
    );
    expect(one.container.querySelector('.sbd-swiper__dots')).toBeNull();
    one.unmount();
    const off = render(<Carousel props={{ ...fixtureCarousel, indicator: 'none' }} />);
    expect(off.container.querySelector('.sbd-swiper__dots')).toBeNull();
  });
});

describe('ProductGrid', () => {
  it('renders the resolved products as cards, price split into yuan and fen', () => {
    render(<ProductGrid props={fixtureProductGrid} data={{ products: fixtureProducts }} />);
    expect(screen.getByText('秋季新款宽松针织开衫 女士百搭外套')).toBeTruthy();
    expect(screen.getByText('129')).toBeTruthy();
    expect(screen.getAllByText('.90').length).toBeGreaterThan(0);
    expect(screen.getByText('¥199.00')).toBeTruthy();
    expect(screen.getByText('新品')).toBeTruthy();
  });

  it('honours the display switches', () => {
    render(
      <ProductGrid
        props={{ ...fixtureProductGrid, showTag: false, showMarketPrice: false }}
        data={{ products: fixtureProducts }}
      />,
    );
    expect(screen.queryByText('新品')).toBeNull();
    expect(screen.queryByText('¥199.00')).toBeNull();
  });

  it('says so when the source resolved to nothing', () => {
    render(<ProductGrid props={fixtureProductGrid} data={{ products: [] }} />);
    expect(screen.getByText('暂无商品')).toBeTruthy();
  });

  it('links a card to its product', () => {
    const onLink = vi.fn();
    render(
      <ProductGrid
        props={fixtureProductGrid}
        data={{ products: fixtureProducts }}
        onLink={onLink}
      />,
    );
    fireEvent.click(screen.getByText('厨房收纳三件套'));
    expect(onLink).toHaveBeenCalledWith({ kind: 'product', id: '15' });
  });
});

describe('ImageCube', () => {
  it('draws left1right2 as three aspectFill cells and links each one', () => {
    const onLink = vi.fn();
    const { container } = render(<ImageCube props={fixtureImageCube} onLink={onLink} />);
    const images = container.querySelectorAll('.sbd-image');
    // The fourth cell is kept in the props but not shown by a three-cell layout.
    expect(images).toHaveLength(3);
    expect(images[0]?.classList.contains('sbd-image--aspectFill')).toBe(true);
    fireEvent.click(images[2] as Element);
    expect(onLink).toHaveBeenCalledWith({ kind: 'webview', url: 'https://example.com/promo' });
  });

  it('keeps each picture’s ratio in the row layouts (widthFix)', () => {
    const { container } = render(<ImageCube props={fixtureImageCubeRow} />);
    const images = container.querySelectorAll('.sbd-image');
    expect(images).toHaveLength(3);
    expect([...images].every((image) => image.classList.contains('sbd-image--widthFix'))).toBe(
      true,
    );
  });

  it('draws an empty cell rather than failing when a layout has too few pictures', () => {
    const { container } = render(
      <ImageCube
        props={{
          ...fixtureImageCube,
          layout: 'grid2x2',
          cells: fixtureImageCube.cells.slice(0, 2),
        }}
      />,
    );
    expect(container.querySelectorAll('.sbd-image')).toHaveLength(2);
  });
});

describe('BlockList', () => {
  it('renders known blocks in order and skips a type it does not know', () => {
    const { container } = render(
      <BlockList
        blocks={[
          { id: 'a', type: 'carousel', props: fixtureCarousel },
          { id: 'b', type: 'fromTheFuture', props: {} },
          { id: 'c', type: 'productGrid', props: fixtureProductGrid },
        ]}
        data={{ c: { products: fixtureProducts.slice(0, 2) } }}
      />,
    );
    const types = [...container.querySelectorAll('[data-block]')].map((node) =>
      node.getAttribute('data-block'),
    );
    expect(types).toEqual(['carousel', 'productGrid']);
  });
});
