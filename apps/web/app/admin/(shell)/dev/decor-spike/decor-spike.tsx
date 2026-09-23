'use client';

import { Alert, Card, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import {
  DecorCanvasDataProvider,
  toPageDocument,
  toPuckData,
  type DecorCanvasData,
  type DecorData,
} from '@/admin/decor';
import { DecorEditor } from '@/admin/decor/editor';
import { DiyDataSourceProvider } from '@/admin/diy/data-source';
import { AssetSourceProvider } from '@/admin/kit/asset/asset-source-context';
import { PageContainer } from '@/admin/kit/page-container';
import {
  fixtureCarousel,
  fixtureHotspotImage,
  fixtureImageCube,
  fixtureNavGrid,
  fixtureNotice,
  fixtureOrderEntry,
  fixtureProductGrid,
  fixtureProductTabs,
  fixtureRichText,
  fixtureSearchBar,
  fixtureServiceGrid,
  fixtureSpacer,
  fixtureTitleBar,
  fixtureUserCard,
  resolveFixtureProducts,
} from '@shop/storefront-blocks/fixtures';
import {
  BLOCKS,
  pageRootProps,
  type BlockType,
  validatePageDocument,
  type PageDocument,
} from '@shop/storefront-blocks/schema';
import { createDemoAssetSource } from '../kit/demo-asset-source';
import { createDecorDemoDataSource } from './demo-data-source';

/**
 * `/admin/dev/decor-spike` — spike S3: the DIY v2 blocks in Puck.
 *
 * Opens a fixture page document, lets the operator edit it on a 375 px
 * canvas, and shows beside it the document the editor would save, checked by
 * `validatePageDocument`. Every source is in memory: no route, no upload.
 */

/** One of every block, each from its fixture, at the version this build writes. */
const FIXTURE_BLOCKS: [BlockType, string, Record<string, unknown>][] = [
  ['searchBar', 'search-bar-1', fixtureSearchBar],
  ['carousel', 'carousel-1', fixtureCarousel],
  ['navGrid', 'nav-grid-1', fixtureNavGrid],
  ['notice', 'notice-1', fixtureNotice],
  ['titleBar', 'title-bar-1', fixtureTitleBar],
  ['productGrid', 'product-grid-1', fixtureProductGrid],
  ['imageCube', 'image-cube-1', fixtureImageCube],
  ['hotspotImage', 'hotspot-image-1', fixtureHotspotImage],
  ['productTabs', 'product-tabs-1', fixtureProductTabs],
  ['spacer', 'spacer-1', fixtureSpacer],
  ['richText', 'rich-text-1', fixtureRichText],
  ['userCard', 'user-card-1', fixtureUserCard],
  ['orderEntry', 'order-entry-1', fixtureOrderEntry],
  ['serviceGrid', 'service-grid-1', fixtureServiceGrid],
];

const FIXTURE_DOCUMENT: PageDocument = {
  schemaVersion: 2,
  root: { props: pageRootProps.parse({ title: '装修试验页' }) },
  blocks: FIXTURE_BLOCKS.map(([type, id, props]) => ({ id, type, v: BLOCKS[type].v, props })),
};

const canvasData: DecorCanvasData = { products: resolveFixtureProducts };
const assets = createDemoAssetSource();
const records = createDecorDemoDataSource();

function DocumentPanel({ data }: { data: DecorData }) {
  const result = useMemo(() => {
    try {
      const document = toPageDocument(data);
      return { document, validation: validatePageDocument(document) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [data]);

  if ('error' in result) {
    return <Alert type="error" showIcon message="无法转换为页面文档" description={result.error} />;
  }
  const { document, validation } = result;
  return (
    <>
      {validation.ok ? (
        <Alert
          type="success"
          showIcon
          message={`文档有效：${document.blocks.length} 个块`}
          style={{ marginBottom: 12 }}
        />
      ) : (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={`文档无效：${validation.issues.length} 处问题`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="decor-issues">
              {validation.issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  <Typography.Text code>{issue.path}</Typography.Text> {issue.message}
                </li>
              ))}
            </ul>
          }
        />
      )}
      <pre
        data-testid="decor-document"
        style={{ fontSize: 12, maxHeight: 480, overflow: 'auto', margin: 0 }}
      >
        {JSON.stringify(document, null, 2)}
      </pre>
    </>
  );
}

export default function DecorSpike() {
  const [data, setData] = useState<DecorData>(() => toPuckData(FIXTURE_DOCUMENT));

  return (
    <AssetSourceProvider source={assets}>
      <DiyDataSourceProvider source={records}>
        <DecorCanvasDataProvider value={canvasData}>
          <PageContainer
            title="装修编辑器试验（DIY v2）"
            subTitle="Puck + 共享块 + 375px 画布；数据全部来自内存"
            extra={<Tag color="orange">spike S3</Tag>}
          >
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="仅开发环境可见"
              description="本页验证 Puck 能否承载 DIY v2：块与小程序同源渲染，右侧是编辑器将要保存的页面文档。"
            />
            {/* The editor gets the full width: Puck's two side panels plus a 375 px
                canvas need ~1100 px before it has to zoom the canvas out. */}
            <div
              style={{ height: 820, border: '1px solid #f0f0f0', marginBottom: 16 }}
              data-testid="decor-editor"
            >
              <DecorEditor data={data} onChange={setData} title="微页面" />
            </div>
            <Card size="small" title="页面文档（schemaVersion 2）">
              <DocumentPanel data={data} />
            </Card>
          </PageContainer>
        </DecorCanvasDataProvider>
      </DiyDataSourceProvider>
    </AssetSourceProvider>
  );
}
