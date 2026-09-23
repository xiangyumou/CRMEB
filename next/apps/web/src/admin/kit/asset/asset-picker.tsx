'use client';

import { CheckOutlined, InboxOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  App,
  Button,
  Col,
  Empty,
  Input,
  Modal,
  Pagination,
  Row,
  Spin,
  Tree,
  Typography,
  Upload,
} from 'antd';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAssetSource } from './asset-source-context';
import type { AssetCategory, AssetItem } from './types';

const PAGE_SIZE = 24;
const ALL_KEY = '__all__';

export interface AssetPickerProps {
  open: boolean;
  onClose: () => void;
  /** Select more than one. Default `false`. */
  multiple?: boolean | undefined;
  /** Cap on the selection when `multiple`. */
  max?: number | undefined;
  /** Called with the chosen assets when the operator confirms. */
  onSelect: (assets: AssetItem[]) => void;
  title?: string | undefined;
  /** `accept` passed to the upload input. Default images only. */
  accept?: string | undefined;
}

function toTreeData(
  categories: AssetCategory[],
): { key: string; title: string; children?: unknown[] }[] {
  const map = (list: AssetCategory[]): { key: string; title: string; children?: unknown[] }[] =>
    list.map((category) => ({
      key: category.id,
      title: category.name,
      ...(category.children?.length ? { children: map(category.children) } : {}),
    }));
  return [{ key: ALL_KEY, title: '全部素材', children: map(categories) }];
}

/**
 * Material library picker: category tree, paginated image grid, drag-and-drop
 * upload, single or multiple selection. Returns contract `asset` objects.
 *
 * Talks to an `AssetSource`, not to routes directly, so it works today against
 * the in-memory stub and unchanged against the real storage API.
 */
export function AssetPicker({
  open,
  onClose,
  multiple = false,
  max,
  onSelect,
  title = '选择素材',
  accept = 'image/*',
}: AssetPickerProps) {
  const source = useAssetSource();
  const { message } = App.useApp();

  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<AssetItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const categories = useQuery({
    queryKey: ['kit.assets.categories'],
    queryFn: () => source.listCategories(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const list = useQuery({
    queryKey: ['kit.assets.list', categoryId ?? null, page, keyword],
    queryFn: () => source.listAssets({ categoryId, page, pageSize: PAGE_SIZE, keyword }),
    enabled: open,
  });

  const treeData = useMemo(() => toTreeData(categories.data ?? []), [categories.data]);

  const toggle = useCallback(
    (item: AssetItem) => {
      setSelected((prev) => {
        const exists = prev.some((asset) => asset.id === item.id);
        if (!multiple) return exists ? [] : [item];
        if (exists) return prev.filter((asset) => asset.id !== item.id);
        if (max !== undefined && prev.length >= max) {
          void message.warning(`最多选择 ${max} 个素材`);
          return prev;
        }
        return [...prev, item];
      });
    },
    [multiple, max, message],
  );

  const reset = useCallback(() => {
    setSelected([]);
    setKeyword('');
    setPage(1);
  }, []);

  const confirm = (): void => {
    onSelect(selected);
    reset();
    onClose();
  };

  const cancel = (): void => {
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      width={920}
      onCancel={cancel}
      onOk={confirm}
      okText={`确定${selected.length > 0 ? `（${selected.length}）` : ''}`}
      cancelText="取消"
      okButtonProps={{ disabled: selected.length === 0 }}
      destroyOnHidden
      styles={{ body: { paddingTop: 12 } }}
    >
      <Row gutter={16} style={{ minHeight: 420 }}>
        <Col xs={24} md={6} style={{ borderRight: '1px solid var(--ant-color-border-secondary)' }}>
          <Spin spinning={categories.isPending}>
            <Tree
              treeData={treeData as never}
              defaultExpandAll
              selectedKeys={[categoryId ?? ALL_KEY]}
              onSelect={(keys) => {
                const key = String(keys[0] ?? ALL_KEY);
                setCategoryId(key === ALL_KEY ? undefined : key);
                setPage(1);
              }}
            />
          </Spin>
        </Col>

        <Col xs={24} md={18}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Input.Search
              allowClear
              placeholder="搜索素材名称"
              style={{ maxWidth: 240 }}
              onSearch={(value) => {
                setKeyword(value);
                setPage(1);
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void list.refetch()}>
              刷新
            </Button>
            <UploadArea
              accept={accept}
              uploading={uploading}
              onUpload={async (files) => {
                setUploading(true);
                try {
                  for (const file of files) await source.upload(file, categoryId);
                  await list.refetch();
                  void message.success(`已上传 ${files.length} 个文件`);
                } catch (error) {
                  void message.error(error instanceof Error ? error.message : '上传失败');
                } finally {
                  setUploading(false);
                }
              }}
            />
          </div>

          <Spin spinning={list.isFetching}>
            {list.data && list.data.items.length > 0 ? (
              <div
                className="admin-scroll-area"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                  gap: 10,
                  maxHeight: 340,
                  overflowY: 'auto',
                }}
              >
                {list.data.items.map((item) => {
                  const active = selected.some((asset) => asset.id === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggle(item)}
                      title={item.name}
                      data-testid={`asset-${item.id}`}
                      aria-pressed={active}
                      style={{
                        position: 'relative',
                        padding: 0,
                        border: `2px solid ${active ? 'var(--ant-color-primary)' : 'var(--ant-color-border)'}`,
                        borderRadius: 6,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: 'var(--ant-color-fill-quaternary)',
                        aspectRatio: '1 / 1',
                      }}
                    >
                      <img
                        src={item.url}
                        alt={item.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                      {active ? (
                        <span
                          style={{
                            position: 'absolute',
                            insetInlineEnd: 4,
                            insetBlockStart: 4,
                            background: 'var(--ant-color-primary)',
                            color: '#fff',
                            borderRadius: '50%',
                            width: 18,
                            height: 18,
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 11,
                          }}
                        >
                          <CheckOutlined />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty
                description={list.isPending ? '加载中…' : '暂无素材'}
                style={{ padding: 48 }}
              />
            )}
          </Spin>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <Typography.Text type="secondary">
              已选 {selected.length}
              {max !== undefined ? ` / ${max}` : ''}
            </Typography.Text>
            <Pagination
              size="small"
              current={page}
              pageSize={PAGE_SIZE}
              total={list.data?.total ?? 0}
              showSizeChanger={false}
              onChange={setPage}
            />
          </div>
        </Col>
      </Row>
    </Modal>
  );
}

function UploadArea({
  accept,
  uploading,
  onUpload,
}: {
  accept: string;
  uploading: boolean;
  onUpload: (files: File[]) => Promise<void>;
}) {
  const buffer = useRef<File[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // antd calls `beforeUpload` once per file; batch them into a single flush so
  // "drop 10 images" is one refetch and one toast, not ten.
  const enqueue = (file: File): boolean => {
    buffer.current.push(file);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const files = buffer.current;
      buffer.current = [];
      void onUpload(files);
    }, 30);
    return false;
  };

  return (
    <Upload
      accept={accept}
      multiple
      showUploadList={false}
      beforeUpload={enqueue}
      disabled={uploading}
    >
      <Button icon={<InboxOutlined />} loading={uploading}>
        上传
      </Button>
    </Upload>
  );
}

export interface AssetPickerHandle {
  /** Resolves with the chosen assets, or `[]` when cancelled. */
  pick: (options?: Omit<AssetPickerProps, 'open' | 'onClose' | 'onSelect'>) => Promise<AssetItem[]>;
  /** Render this somewhere in the tree; it is the modal itself. */
  holder: ReactNode;
}

/**
 * Promise-style access to the picker, for places that can't easily hold modal
 * state — a rich-text toolbar button, a table row action.
 *
 * ```tsx
 * const picker = useAssetPicker();
 * // …
 * const [image] = await picker.pick({ multiple: false });
 * return <>{picker.holder}</>;
 * ```
 */
export function useAssetPicker(): AssetPickerHandle {
  const [state, setState] = useState<{
    open: boolean;
    options: Omit<AssetPickerProps, 'open' | 'onClose' | 'onSelect'>;
  }>({ open: false, options: {} });
  const resolver = useRef<((assets: AssetItem[]) => void) | null>(null);

  const pick = useCallback(
    (options: Omit<AssetPickerProps, 'open' | 'onClose' | 'onSelect'> = {}) =>
      new Promise<AssetItem[]>((resolve) => {
        resolver.current = resolve;
        setState({ open: true, options });
      }),
    [],
  );

  const settle = useCallback((assets: AssetItem[]) => {
    resolver.current?.(assets);
    resolver.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const holder = (
    <AssetPicker
      {...state.options}
      open={state.open}
      onClose={() => settle([])}
      onSelect={(assets) => settle(assets)}
    />
  );

  return { pick, holder };
}
