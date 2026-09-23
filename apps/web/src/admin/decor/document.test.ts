import type { Data } from '@puckeditor/core';
import {
  fixtureCarousel,
  fixtureImageCube,
  fixtureProductGrid,
} from '@shop/storefront-blocks/fixtures';
import { validatePageDocument, type PageDocument } from '@shop/storefront-blocks/schema';
import { describe, expect, it } from 'vitest';

import { newBlockProps } from './config';
import { DecorConversionError, toPageDocument, toPuckData } from './document';

/** Editor data in the shape Puck 0.23 hands to `onChange`. */
const puckData = {
  root: { props: { title: '装修试验页', background: '#f5f5f5', shareTitle: '' } },
  content: [
    {
      type: 'carousel',
      props: { id: 'carousel-0b8c6a3e-3f0d-4a47-9d0e-5b1d2b7c9f10', ...fixtureCarousel },
    },
    {
      type: 'productGrid',
      props: { id: 'productGrid-6a1f', ...fixtureProductGrid },
    },
    {
      type: 'imageCube',
      props: { id: 'imageCube-77e2', ...fixtureImageCube },
    },
  ],
} as Data;

describe('editor data ⇄ page document', () => {
  it('round-trips Puck data through the document without losing anything', () => {
    const document = toPageDocument(structuredClone(puckData));
    expect(toPuckData(document)).toEqual(puckData);
  });

  it('round-trips a document through the editor data without losing anything', () => {
    const document = toPageDocument(puckData);
    // Through JSON as well: what is stored is what comes back.
    const stored = JSON.parse(JSON.stringify(document)) as PageDocument;
    expect(toPageDocument(toPuckData(stored))).toEqual(stored);
  });

  it('writes the v2 envelope: ids beside the props, the current block version', () => {
    const document = toPageDocument(puckData);
    expect(document.schemaVersion).toBe(2);
    expect(document.blocks.map(({ id, type, v }) => ({ id, type, v }))).toEqual([
      { id: 'carousel-0b8c6a3e-3f0d-4a47-9d0e-5b1d2b7c9f10', type: 'carousel', v: 1 },
      { id: 'productGrid-6a1f', type: 'productGrid', v: 2 },
      { id: 'imageCube-77e2', type: 'imageCube', v: 1 },
    ]);
    expect(document.blocks[0]?.props).not.toHaveProperty('id');
    expect(validatePageDocument(document)).toMatchObject({ ok: true, unknownBlocks: [] });
  });

  it('keeps a newly inserted block invalid until its images are picked', () => {
    const data: Data = {
      ...puckData,
      content: [{ type: 'carousel', props: { id: 'carousel-new', ...newBlockProps('carousel') } }],
    };
    const result = validatePageDocument(toPageDocument(data));
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: 'blocks.0.props.slides.0.image', message: '请选择图片' }],
    });
  });

  it('accepts an empty zones map and refuses a non-empty one', () => {
    expect(toPageDocument({ ...puckData, zones: {} }).blocks).toHaveLength(3);
    expect(() =>
      toPageDocument({
        ...puckData,
        zones: { 'carousel-x:inner': [{ type: 'carousel', props: { id: 'y' } }] },
      }),
    ).toThrow(DecorConversionError);
  });

  it('refuses to open a block at another version or of an unknown type', () => {
    const document = toPageDocument(puckData);
    const old = { ...document, blocks: [{ ...document.blocks[0]!, v: 0 }] };
    expect(() => toPuckData(old)).toThrow(/需要先迁移到 1/);
    const future = { ...document, blocks: [{ ...document.blocks[0]!, type: 'videoPlayer' }] };
    expect(() => toPuckData(future)).toThrow(/不认识块类型「videoPlayer」/);
  });
});
