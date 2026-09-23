import type { PageDocument } from './document';
import type {
  DecorDocumentDetail,
  DecorDocumentSummary,
  ResolvedPage,
  RevisionSummary,
} from './schemas';

/** Example payloads for the decor routes (the mock server serves the first of each). */

const IMAGE = 'https://cdn.example.com/uploads/decor/banner-1.jpg';
const style = { marginY: 'none', paddingX: 'none', radius: 'none' } as const;
const visibility = { audience: 'all', platforms: [] } as const;

export const decorDocumentExample: PageDocument = {
  schemaVersion: 2,
  root: {
    props: { title: '首页', background: '#f5f5f5', shareEnabled: true, shareTitle: '' },
  },
  blocks: [
    {
      id: 'b-carousel',
      type: 'carousel',
      v: 1,
      props: {
        slides: [{ image: IMAGE, link: { kind: 'product', id: '12' }, alt: '新品上市' }],
        height: 340,
        autoplay: true,
        interval: 3000,
        indicator: 'dots',
        indicatorColor: '#ffffff80',
        indicatorActiveColor: '#ffffff',
        style,
        visibility,
      },
    },
    {
      id: 'b-grid',
      type: 'productGrid',
      v: 1,
      props: {
        source: { mode: 'category', categoryId: '3', sort: 'sales', limit: 4 },
        titleLines: 2,
        showMarketPrice: true,
        showTag: true,
        style: { ...style, marginY: 'sm' },
        visibility,
      },
    },
  ],
};

export const revisionSummaryExample: RevisionSummary = {
  id: '41',
  number: 3,
  note: '国庆活动',
  authorAdminId: '1',
  restoredFrom: null,
  createdAt: '2026-09-23T10:00:00+08:00',
};

export const decorDocumentSummaryExample: DecorDocumentSummary = {
  id: '7',
  kind: 'home',
  name: '国庆首页',
  title: '首页',
  designation: 'home',
  draftVersion: '12',
  published: revisionSummaryExample,
  hasUnpublishedChanges: false,
  createdAt: '2026-09-20T09:00:00+08:00',
  updatedAt: '2026-09-23T10:00:00+08:00',
};

export const decorDocumentDetailExample: DecorDocumentDetail = {
  ...decorDocumentSummaryExample,
  draft: decorDocumentExample,
  issues: [],
  warnings: [],
};

export const resolvedPageExample: ResolvedPage = {
  id: '7',
  kind: 'home',
  revision: 3,
  preview: false,
  root: decorDocumentExample.root,
  blocks: [
    { ...(decorDocumentExample.blocks[0] as PageDocument['blocks'][number]), data: {} },
    {
      ...(decorDocumentExample.blocks[1] as PageDocument['blocks'][number]),
      data: {
        products: [
          {
            id: '12',
            title: '秋季新款针织开衫',
            image: 'https://cdn.example.com/uploads/product/12.jpg',
            price: '129.00',
            marketPrice: '199.00',
            tag: '热卖',
          },
          {
            id: '31',
            title: '纯棉长袖T恤',
            image: 'https://cdn.example.com/uploads/product/31.jpg',
            price: '59.00',
          },
        ],
      },
    },
  ],
  personal: null,
  version: 'rev-41',
  resolvedAt: '2026-09-23T10:05:00+08:00',
};
