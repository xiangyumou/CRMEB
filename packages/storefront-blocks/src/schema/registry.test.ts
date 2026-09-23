import { describe, expect, it } from 'vitest';

import { BLOCK_COMPONENTS } from '../blocks';
import { fixtureCarousel, fixtureImageCube, fixtureProductGrid } from '../fixtures';
import { BLOCKS, carouselProps, decorBlocks, imageCubeProps, productGridProps } from './index';

describe('the contracts block registry', () => {
  it('still accepts the fixtures unchanged', () => {
    expect(carouselProps.parse(fixtureCarousel)).toEqual(fixtureCarousel);
    expect(productGridProps.parse(fixtureProductGrid)).toEqual(fixtureProductGrid);
    expect(imageCubeProps.parse(fixtureImageCube)).toEqual(fixtureImageCube);
  });

  it('has a component for every type this package claims, at the registry version', () => {
    for (const [type, spec] of Object.entries(BLOCKS)) {
      expect(BLOCK_COMPONENTS[type as keyof typeof BLOCKS]).toBeDefined();
      expect(spec.v).toBe(decorBlocks.get(type)?.v);
    }
  });

  // Stream G adds these. The list shrinks as components land; a type added to
  // the contracts without a component shows up here.
  it('lists the registered types that have no component yet', () => {
    expect(decorBlocks.types.filter((type) => !Object.hasOwn(BLOCK_COMPONENTS, type))).toEqual([
      'userCard',
      'orderEntry',
      'serviceGrid',
    ]);
  });
});
