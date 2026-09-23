'use client';

import {
  ArrowLeftOutlined,
  QrcodeOutlined,
  RedoOutlined,
  SaveOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  diyPageGet,
  diyPageList,
  diyPageSaveContent,
  diyPageUpdate,
  diyThemeList,
} from '@shop/contracts/diy/diy.contract';
import { Alert, Button, Modal, QRCode, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { ApiError, presentApiError, useRouteMutation, useRouteQuery } from '../api';
import { LinkSourceProvider, PageContainer } from '../kit';
import { Can, useCan } from '../session';
import { DiyCanvas } from './canvas';
import { catalogLinkTargets, createCatalogDiyDataSource } from './catalog-source';
import { DiyDataSourceProvider } from './data-source';
import { DiyEditorProvider } from './editor-context';
import { DiyInspector } from './inspector';
import { createDiyLinkSource } from './link-source';
import { DiyPalette } from './palette';
import { DEFAULT_DIY_THEME, type DiyTheme } from './panel-api';
import {
  canRedo,
  canUndo,
  createDiyEditorState,
  diyEditorReducer,
  isDirty,
  toDiyContent,
  type DiyEditorState,
} from './store';

/**
 * 页面装修 editor — the three-pane shell.
 *
 * Palette on the left, the page on a phone-width canvas in the middle, the
 * selected component's config panel on the right — the arrangement operators
 * of this kind of page builder already know.
 *
 * Saving sends the whole component map with the version the editor loaded. A
 * page that moved underneath comes back `DIY_VERSION_CONFLICT` rather than
 * being overwritten, and the operator is told rather than finding out later.
 */

const PANE_BORDER = '1px solid var(--ant-color-border-secondary, #f0f0f0)';

export function DiyEditor({ pageId }: { pageId: string }) {
  const detail = useRouteQuery(diyPageGet, { params: { id: pageId } });
  const themes = useRouteQuery(diyThemeList);

  if (detail.isPending) {
    return (
      <div style={{ padding: 64, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }
  if (!detail.data) {
    return <Alert type="error" showIcon message="页面不存在或已删除" />;
  }
  return (
    <DiyEditorInner
      key={detail.data.id}
      detail={detail.data}
      theme={themeOf(themes.data?.items)}
      refetch={() => void detail.refetch()}
    />
  );
}

/** The active theme's two brand colours, defaulted to CRMEB's own red. */
function themeOf(
  items: { isActive: boolean; tokens: Record<string, unknown> }[] | undefined,
): DiyTheme {
  const active = items?.find((item) => item.isActive);
  if (!active) return DEFAULT_DIY_THEME;
  const theme = active.tokens.theme;
  const accent = active.tokens.accent;
  return {
    theme: typeof theme === 'string' ? theme : DEFAULT_DIY_THEME.theme,
    accent: typeof accent === 'string' ? accent : DEFAULT_DIY_THEME.accent,
  };
}

function DiyEditorInner({
  detail,
  theme,
  refetch,
}: {
  detail: Parameters<typeof createDiyEditorState>[0];
  theme: DiyTheme;
  refetch: () => void;
}) {
  const [state, dispatch] = useReducer(diyEditorReducer, detail, createDiyEditorState);
  const [preview, setPreview] = useState(false);
  const [conflict, setConflict] = useState(false);
  const can = useCan();
  const canEdit = can('diy:page:update');
  // The catalog is merged, so the pickers read real products, categories and
  // 商品标签 rather than the stub; 文章 / 优惠券 / 拼团 still fall through to it.
  const linkSource = useMemo(() => createDiyLinkSource({ targets: catalogLinkTargets }), []);
  const dataSource = useMemo(() => createCatalogDiyDataSource(), []);

  const saveSettings = useRouteMutation(diyPageUpdate, { presentError: false });
  const saveContent = useRouteMutation(diyPageSaveContent, {
    invalidate: [diyPageList],
    presentError: false,
  });

  const busy = saveContent.isPending || saveSettings.isPending;
  const readOnly = !canEdit || busy;
  const dirty = isDirty(state);

  useBeforeUnload(dirty);

  const save = async (publish: boolean): Promise<void> => {
    try {
      // Settings first: a rename that fails should not leave the content saved
      // under the old name with no sign that anything went wrong.
      if (
        state.meta.name !== state.baseline.meta.name ||
        state.meta.title !== state.baseline.meta.title ||
        state.meta.background !== state.baseline.meta.background
      ) {
        await saveSettings.mutateAsync({
          params: { id: state.meta.id },
          body: {
            name: state.meta.name,
            title: state.meta.title,
            background: state.meta.background,
          },
        });
      }
      const saved = await saveContent.mutateAsync({
        params: { id: state.meta.id },
        body: { content: toDiyContent(state), version: state.meta.version, publish },
      });
      dispatch({ type: 'saved', version: saved.version, status: saved.status });
    } catch (cause) {
      // The mutations opt out of the global toast so the conflict can have a
      // dialog of its own; everything else is presented the usual way.
      if (ApiError.is(cause) && cause.code === 'DIY_VERSION_CONFLICT') setConflict(true);
      else presentApiError(cause);
    }
  };

  return (
    <LinkSourceProvider source={linkSource}>
      <DiyDataSourceProvider source={dataSource}>
        <DiyEditorProvider value={{ state, dispatch, readOnly, theme }}>
          <PageContainer
            breadcrumb={[{ label: '页面装修', href: '/admin/diy' }, { label: state.meta.name }]}
            title={
              <Space>
                <Link href="/admin/diy" aria-label="返回列表">
                  <ArrowLeftOutlined />
                </Link>
                {state.meta.name}
                <Tag color={state.meta.status === 'published' ? 'green' : 'default'}>
                  {state.meta.status === 'published' ? '已发布' : '草稿'}
                </Tag>
                {state.meta.isHome ? <Tag color="blue">首页</Tag> : null}
                {dirty ? <Tag color="orange">未保存</Tag> : null}
              </Space>
            }
            extra={
              <Space>
                <Tooltip title="撤销">
                  <Button
                    icon={<UndoOutlined />}
                    disabled={!canUndo(state) || readOnly}
                    onClick={() => dispatch({ type: 'undo' })}
                  />
                </Tooltip>
                <Tooltip title="重做">
                  <Button
                    icon={<RedoOutlined />}
                    disabled={!canRedo(state) || readOnly}
                    onClick={() => dispatch({ type: 'redo' })}
                  />
                </Tooltip>
                <Button icon={<QrcodeOutlined />} onClick={() => setPreview(true)}>
                  预览
                </Button>
                <Can permission="diy:page:update">
                  <Button icon={<SaveOutlined />} loading={busy} onClick={() => void save(false)}>
                    保存
                  </Button>
                </Can>
                <Can permission="diy:page:publish">
                  <Button type="primary" loading={busy} onClick={() => void save(true)}>
                    保存并发布
                  </Button>
                </Can>
              </Space>
            }
          >
            {canEdit ? null : (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="没有编辑权限，当前为只读预览"
              />
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '260px minmax(0, 1fr) 340px',
                gap: 12,
                alignItems: 'start',
              }}
            >
              <Pane title="组件库">
                <DiyPalette />
              </Pane>
              <div
                style={{ background: 'var(--ant-color-fill-quaternary, #fafafa)', borderRadius: 8 }}
              >
                <DiyCanvas />
              </div>
              <Pane title="配置">
                <DiyInspector />
              </Pane>
            </div>
          </PageContainer>

          <PreviewModal
            open={preview}
            onClose={() => setPreview(false)}
            kind={state.meta.kind}
            pageId={state.meta.id}
          />

          <Modal
            open={conflict}
            title="页面已被其他人修改"
            okText="放弃我的改动并重新载入"
            cancelText="留在当前页面"
            onOk={() => {
              setConflict(false);
              refetch();
            }}
            onCancel={() => setConflict(false)}
          >
            <Typography.Paragraph>
              这个页面在你编辑期间被保存过，为避免覆盖对方的改动，本次保存没有生效。
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary">
              重新载入会丢弃你当前未保存的内容；如需保留，请先把改动复制出来。
            </Typography.Paragraph>
          </Modal>
        </DiyEditorProvider>
      </DiyDataSourceProvider>
    </LinkSourceProvider>
  );
}

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ border: PANE_BORDER, borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: PANE_BORDER,
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {title}
      </div>
      <div style={{ padding: 12, maxHeight: '70vh', overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

/**
 * Where the storefront serves this page.
 *
 * The uni-app routes are fixed strings in `template/uni-app/pages.json`. The
 * origin is the admin's own, which is right because the edge serves the H5
 * build from the same host.
 */
export function storefrontPreviewPath(kind: string, pageId: string): string {
  switch (kind) {
    case 'home':
      return '/pages/index/index';
    case 'category':
      return '/pages/goods_cate/goods_cate';
    case 'product_detail':
      return '/pages/goods_details/index';
    case 'user_center':
      return '/pages/user/index';
    default:
      return `/pages/annex/special/index?id=${pageId}`;
  }
}

function PreviewModal({
  open,
  onClose,
  kind,
  pageId,
}: {
  open: boolean;
  onClose: () => void;
  kind: string;
  pageId: string;
}) {
  const path = storefrontPreviewPath(kind, pageId);
  // The server has no origin to render, so it is read through a store rather
  // than an effect: no setState during hydration, no mismatch.
  const origin = useSyncExternalStore(subscribeNothing, readOrigin, readNoOrigin);
  const url = `${origin}${path}`;

  return (
    <Modal open={open} onCancel={onClose} footer={null} title="预览" width={360}>
      <div style={{ textAlign: 'center' }}>
        <QRCode value={url || path} size={180} />
        <Typography.Paragraph copyable={{ text: url }} style={{ marginTop: 12, fontSize: 12 }}>
          {url || path}
        </Typography.Paragraph>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          扫码在手机端查看已保存的内容；未保存的改动不会出现在预览里。
        </Typography.Text>
      </div>
    </Modal>
  );
}

const subscribeNothing = (): (() => void) => () => undefined;
const readOrigin = (): string => window.location.origin;
const readNoOrigin = (): string => '';

/** Stops a tab close from silently dropping an unsaved page. */
function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}

export type { DiyEditorState };
