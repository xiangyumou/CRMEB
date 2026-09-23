import type { CustomFieldRender, Field } from '@puckeditor/core';
import {
  carouselProps,
  imageCubeProps,
  pageRootProps,
  productGridProps,
  ui,
} from '@shop/storefront-blocks/schema';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defaultsOf, zodToPuckFields, type CustomFieldRenderers } from './zod-to-puck';

const stub = (kind: string): CustomFieldRender<unknown> =>
  Object.assign(() => null as never, { kind });

const custom: CustomFieldRenderers = {
  image: stub('image'),
  link: stub('link'),
  color: stub('color'),
  productSource: stub('productSource'),
  richText: stub('richText'),
  hotspots: stub('hotspots'),
};

type AnyField = Field & Record<string, any>;

function field(fields: Record<string, Field>, name: string): AnyField {
  const found = fields[name];
  if (!found) throw new Error(`no field ${name}`);
  return found as AnyField;
}

describe('zodToPuckFields', () => {
  it('maps every carousel prop to a control, with the schema label', () => {
    const fields = zodToPuckFields(carouselProps, custom);
    expect(Object.keys(fields)).toEqual([
      'slides',
      'height',
      'autoplay',
      'interval',
      'indicator',
      'indicatorColor',
      'indicatorActiveColor',
      'style',
      'visibility',
    ]);
    expect(field(fields, 'height')).toMatchObject({
      type: 'number',
      label: '高度（750 设计稿 px）',
      min: 100,
      max: 1000,
      step: 10,
    });
    // Puck has no switch: a boolean becomes a 开/关 radio over real booleans.
    expect(field(fields, 'autoplay')).toMatchObject({
      type: 'radio',
      options: [
        { label: '开', value: true },
        { label: '关', value: false },
      ],
    });
    expect(field(fields, 'indicator')).toMatchObject({
      type: 'radio',
      options: [
        { label: '显示', value: 'dots' },
        { label: '隐藏', value: 'none' },
      ],
    });
    expect(field(fields, 'indicatorColor')).toMatchObject({ type: 'custom', render: custom.color });
  });

  it('turns an array of objects into an array field with bounds, new-item props and a summary', () => {
    const slides = field(zodToPuckFields(carouselProps, custom), 'slides');
    expect(slides).toMatchObject({ type: 'array', label: '图片', min: 1, max: 10 });
    expect(Object.keys(slides.arrayFields)).toEqual(['image', 'link', 'alt']);
    expect(slides.arrayFields.image).toMatchObject({ type: 'custom', render: custom.image });
    // The optional link says so, so the link control can offer 不跳转.
    expect(slides.arrayFields.link).toMatchObject({
      type: 'custom',
      render: custom.link,
      metadata: { optional: true },
    });
    expect(slides.defaultItemProps()).toEqual({ image: '', alt: '' });
    expect(slides.getItemSummary({ alt: '秋季上新' }, 0)).toBe('秋季上新');
    expect(slides.getItemSummary({ alt: '' }, 2)).toBe('图片 3');
  });

  it('turns an object into an object field and a union of literals into typed options', () => {
    const fields = zodToPuckFields(productGridProps, custom);
    expect(field(fields, 'source')).toMatchObject({
      type: 'custom',
      render: custom.productSource,
    });
    expect(field(fields, 'titleLines')).toMatchObject({
      type: 'radio',
      options: [
        { label: '一行', value: 1 },
        { label: '两行', value: 2 },
      ],
    });
    const style = field(fields, 'style');
    expect(style).toMatchObject({ type: 'object', label: '样式' });
    expect(Object.keys(style.objectFields)).toEqual([
      'marginY',
      'paddingX',
      'radius',
      'background',
    ]);
    expect(style.objectFields.marginY).toMatchObject({
      type: 'radio',
      options: [
        { label: '无', value: 'none' },
        { label: '小', value: 'sm' },
        { label: '中', value: 'md' },
        { label: '大', value: 'lg' },
      ],
    });
    expect(style.objectFields.background).toMatchObject({ type: 'custom', render: custom.color });
  });

  it('uses a select when the schema asks for one, and text for strings', () => {
    const cube = zodToPuckFields(imageCubeProps, custom);
    const layout = field(cube, 'layout');
    expect(layout.type).toBe('select');
    expect(layout.options).toContainEqual({ label: '左一右二', value: 'left1right2' });
    expect(field(cube, 'cells')).toMatchObject({ type: 'array', min: 1, max: 4 });

    const root = zodToPuckFields(pageRootProps, custom);
    expect(field(root, 'title')).toMatchObject({ type: 'text', label: '页面标题' });
    expect(field(root, 'background')).toMatchObject({ type: 'custom', render: custom.color });
  });

  it('honours textarea, placeholder and hidden from the metadata', () => {
    const schema = z.object({
      intro: z.string().meta(ui({ label: '简介', field: 'textarea', placeholder: '一句话' })),
      internal: z.string().meta(ui({ label: '内部', hidden: true })),
    });
    const fields = zodToPuckFields(schema, custom);
    expect(fields).toEqual({
      intro: expect.objectContaining({ type: 'textarea', label: '简介', placeholder: '一句话' }),
    });
  });

  it('refuses a prop it has no control for, unless a fallback renderer is given', () => {
    const schema = z.object({ extra: z.record(z.string(), z.string()) });
    expect(() => zodToPuckFields(schema, custom)).toThrow(/no editor control for "extra"/);
    const unsupported = stub('unsupported');
    expect(zodToPuckFields(schema, { ...custom, unsupported })).toEqual({
      extra: expect.objectContaining({ type: 'custom', label: 'extra', render: unsupported }),
    });
  });
});

describe('defaultsOf', () => {
  it('fills schema defaults, including the inner defaults of a prefault object', () => {
    expect(defaultsOf(productGridProps)).toEqual({
      source: { mode: 'manual', ids: [] },
      layout: 'grid2',
      titleLines: 2,
      showMarketPrice: true,
      showTag: true,
      style: { marginY: 'none', paddingX: 'none', radius: 'none' },
      visibility: { audience: 'all', platforms: [] },
    });
  });
});
