'use client';

import { useState } from 'react';
import { Button, Select, Space, Tag } from 'antd';
import {
  cmsArticleCreate,
  cmsArticleDelete,
  cmsArticleDetail,
  cmsArticleList,
  cmsArticleSetStatus,
  cmsArticleUpdate,
  cmsCategoryList,
} from '@shop/contracts/cms/cms.admin.contract';
import { articleForm, type AdminArticleListItem } from '@shop/contracts/cms/schemas';
import { catalogAdminProductList } from '@shop/contracts/catalog/catalog.product.admin.contract';

import { useRouteMutation, useRouteQuery } from '@/admin/api/hooks';
import { ConfirmButton } from '@/admin/kit/confirm-button';
import { DrawerForm, useFormModal } from '@/admin/kit/form/modal-form';
import { PageContainer } from '@/admin/kit/page-container';
import { statusOptions } from '@/admin/kit/status-tag';
import {
  actionsColumn,
  enumColumn,
  idColumn,
  instantColumn,
  textColumn,
} from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { Can } from '@/admin/session/can';

import { ARTICLE_STATUS } from '../cms-enums';

/**
 * 文章管理.
 *
 * The whole article is one form, including the promoted product: separate
 * link/unlink buttons in the list would write `product_id` without passing
 * through any of the article's own validation. There is one save path here, and one audit
 * entry per save.
 *
 * 状态 is three-valued on purpose. 草稿 is what an unfinished article is, and
 * 隐藏 is how a published one is taken down without deleting the URL — which
 * matters, because the storefront now actually filters on it.
 */

/**
 * 关联商品 — a search-as-you-type picker over the catalog's own admin list.
 *
 * It asks the catalog through its published route rather than growing a second
 * product query in the CMS; an article promoting a product it cannot name is
 * the failure mode this avoids.
 */
function ProductPicker(props: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
}) {
  const [keyword, setKeyword] = useState('');
  const products = useRouteQuery(catalogAdminProductList, {
    query: { page: 1, pageSize: 20, ...(keyword ? { keyword } : {}) },
  });

  return (
    <Select
      allowClear
      showSearch
      value={props.value ?? undefined}
      disabled={props.disabled}
      placeholder="搜索商品名称"
      filterOption={false}
      loading={products.isPending}
      onSearch={setKeyword}
      onChange={(next: string | undefined) => props.onChange(next ?? null)}
      options={(products.data?.items ?? []).map((item) => ({
        value: item.id,
        label: `${item.name}（¥${item.price}）`,
      }))}
      style={{ width: '100%' }}
    />
  );
}

export function ArticlesPage() {
  // The list row carries no body, so the drawer loads the article it edits —
  // and mounts the form only once it has it.
  const drawer = useFormModal<AdminArticleListItem, typeof cmsArticleDetail>({
    detail: { route: cmsArticleDetail, params: (row) => ({ id: row.id }) },
  });
  const editing = drawer.record;

  const categories = useRouteQuery(cmsCategoryList, { query: {} });
  const categoryOptions = (categories.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.depth === 1 ? `└ ${item.title}` : item.title,
  }));

  const setStatus = useRouteMutation(cmsArticleSetStatus, {
    invalidate: [cmsArticleList],
    successMessage: '已更新状态',
  });

  return (
    <PageContainer subTitle="前台只显示「已发布」的文章；草稿和隐藏的文章连详情接口都不返回">
      <CrudTable
        route={cmsArticleList}
        filters={[
          { kind: 'text', name: 'keyword', label: '标题/摘要' },
          { kind: 'select', name: 'categoryId', label: '分类', options: categoryOptions },
          { kind: 'select', name: 'status', label: '状态', options: statusOptions(ARTICLE_STATUS) },
          {
            kind: 'select',
            name: 'isHot',
            label: '热门',
            options: [
              { value: 'true', label: '是' },
              { value: 'false', label: '否' },
            ],
          },
        ]}
        toolbar={
          <Can permission="cms:article:write">
            <Button type="primary" onClick={() => drawer.show()}>
              新建文章
            </Button>
          </Can>
        }
        columns={[
          idColumn<AdminArticleListItem>({ sortable: true }),
          textColumn<AdminArticleListItem>({ title: '标题', dataIndex: 'title', ellipsis: true }),
          {
            title: '分类',
            key: 'categoryTitle',
            width: 140,
            render: (_value: unknown, row: AdminArticleListItem) => row.categoryTitle ?? '—',
          },
          enumColumn<AdminArticleListItem>({
            title: '状态',
            dataIndex: 'status',
            map: ARTICLE_STATUS,
            width: 100,
          }),
          {
            title: '标记',
            key: 'flags',
            width: 120,
            render: (_value: unknown, row: AdminArticleListItem) => (
              <Space size={4}>
                {row.isHot ? <Tag color="red">热门</Tag> : null}
                {row.isBanner ? <Tag color="blue">banner</Tag> : null}
              </Space>
            ),
          },
          { title: '浏览量', dataIndex: 'views', key: 'views', width: 100, sorter: true },
          { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 90, sorter: true },
          instantColumn<AdminArticleListItem>({ title: '发布时间', dataIndex: 'publishedAt' }),
          actionsColumn<AdminArticleListItem>({
            render: (row) => (
              <>
                <Can permission="cms:article:write">
                  <Button type="link" size="small" onClick={() => drawer.show(row)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    loading={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({
                        params: { id: row.id },
                        body: { status: row.status === 'published' ? 'hidden' : 'published' },
                      })
                    }
                  >
                    {row.status === 'published' ? '隐藏' : '发布'}
                  </Button>
                </Can>
                <ConfirmButton
                  route={cmsArticleDelete}
                  input={{ params: { id: row.id } }}
                  title={`删除文章「${row.title}」？`}
                  description="删除后前台链接立即失效，别名会被释放。"
                  invalidate={[cmsArticleList]}
                  successMessage="已删除"
                  permission="cms:article:delete"
                  buttonProps={{ type: 'link', size: 'small', danger: true }}
                >
                  删除
                </ConfirmButton>
              </>
            ),
          }),
        ]}
      />

      <DrawerForm
        {...drawer.props}
        width={900}
        title={editing ? '编辑文章' : '新建文章'}
        schema={articleForm}
        fields={[
          { kind: 'text', name: 'title', label: '标题', span: 16, maxLength: 255 },
          {
            kind: 'select',
            name: 'categoryId',
            label: '分类',
            span: 8,
            allowClear: true,
            options: categoryOptions,
          },
          {
            kind: 'text',
            name: 'slug',
            label: '别名',
            span: 8,
            maxLength: 255,
            placeholder: 'double-eleven-2026',
            help: '选填，用于固定链接；小写字母、数字和连字符',
          },
          { kind: 'text', name: 'author', label: '作者', span: 8, maxLength: 64 },
          { kind: 'number', name: 'sortOrder', label: '排序', span: 8, min: 0, max: 9999 },
          { kind: 'asset', name: 'coverImageUrl', label: '封面图', span: 12 },
          {
            kind: 'custom',
            name: 'productId',
            label: '关联商品',
            span: 12,
            help: '选填；商品下架后前台不再显示这张卡片',
            render: ({ value, onChange, disabled }) => (
              <ProductPicker
                value={typeof value === 'string' ? value : null}
                onChange={onChange}
                disabled={disabled}
              />
            ),
          },
          {
            kind: 'textarea',
            name: 'summary',
            label: '摘要',
            span: 24,
            rows: 2,
            maxLength: 255,
            showCount: true,
          },
          {
            kind: 'text',
            name: 'sourceUrl',
            label: '原文链接',
            span: 24,
            maxLength: 512,
            help: '填了之后前台直接打开这个链接，不再显示正文',
          },
          { kind: 'richText', name: 'contentHtml', label: '正文', span: 24, minHeight: 360 },
          { kind: 'text', name: 'shareTitle', label: '分享标题', span: 12, maxLength: 255 },
          { kind: 'text', name: 'shareSummary', label: '分享描述', span: 12, maxLength: 255 },
          {
            kind: 'radio',
            name: 'status',
            label: '状态',
            span: 12,
            optionType: 'button',
            options: statusOptions(ARTICLE_STATUS),
          },
          {
            kind: 'switch',
            name: 'isHot',
            label: '热门',
            span: 6,
            checkedText: '是',
            uncheckedText: '否',
          },
          {
            kind: 'switch',
            name: 'isBanner',
            label: 'banner',
            span: 6,
            checkedText: '是',
            uncheckedText: '否',
          },
        ]}
        initialValues={
          editing
            ? undefined
            : {
                status: 'draft',
                sortOrder: 0,
                isHot: false,
                isBanner: false,
                contentHtml: '',
                categoryId: null,
                productId: null,
              }
        }
        route={editing ? cmsArticleUpdate : cmsArticleCreate}
        toInput={(values) =>
          editing ? { params: { id: editing.id }, body: values } : { body: values }
        }
        invalidate={[cmsArticleList]}
        successMessage="已保存"
      />
    </PageContainer>
  );
}
