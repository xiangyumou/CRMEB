'use client';

import {
  diyPageCopy,
  diyPageCreate,
  diyPageDelete,
  diyPageList,
  diyPagePublish,
  diyPageRestoreDefault,
  diyPageSaveDefault,
  diyPageSetHome,
} from '@shop/contracts/diy/diy.contract';
import { diyPageCreateBody } from '@shop/contracts/diy/schemas';
import type { DiyPageSummary } from '@shop/contracts/diy/schemas';
import { diyPageKind } from '@shop/contracts/diy/schema/page';
import { Button, Space, Tag } from 'antd';
import Link from 'next/link';

import { useRouteMutation } from '../api';
import {
  ConfirmButton,
  CrudTable,
  ModalForm,
  PageContainer,
  actionsColumn,
  enumColumn,
  idColumn,
  instantColumn,
  statusOptions,
  textColumn,
  useFormModal,
  type StatusMap,
} from '../kit';
import { Can } from '../session';

/**
 * 页面装修 list.
 *
 * The legacy screen was four tabs over four tables (首页 / 分类 / 商品详情 /
 * 个人中心 / 微页面); this is one table with a 类型 filter, because they were the
 * same rows with the same columns and the same actions all along.
 */

const KIND_LABELS: StatusMap<DiyPageSummary['kind']> = {
  home: { label: '首页', color: 'blue' },
  category: { label: '商品分类', color: 'geekblue' },
  product_detail: { label: '商品详情', color: 'purple' },
  user_center: { label: '个人中心', color: 'cyan' },
  micro: { label: '微页面', color: 'default' },
};

const STATUS_LABELS: StatusMap<DiyPageSummary['status']> = {
  draft: { label: '草稿', color: 'default' },
  published: { label: '已发布', color: 'success' },
};

export function DiyPageList() {
  const modal = useFormModal<{ id: string }>();
  const publish = useRouteMutation(diyPagePublish, {
    invalidate: [diyPageList],
    successMessage: '已发布',
  });

  return (
    <PageContainer
      title="页面装修"
      extra={
        <Space>
          <Can permission="diy:link:read">
            <Link href="/admin/diy/links">
              <Button>页面链接</Button>
            </Link>
          </Can>
          <Can permission="diy:page:create">
            <Button type="primary" onClick={() => modal.show()}>
              新建页面
            </Button>
          </Can>
        </Space>
      }
    >
      <CrudTable
        route={diyPageList}
        filters={[
          { kind: 'text', name: 'keyword', label: '名称' },
          { kind: 'select', name: 'kind', label: '类型', options: statusOptions(KIND_LABELS) },
          { kind: 'select', name: 'status', label: '状态', options: statusOptions(STATUS_LABELS) },
        ]}
        columns={[
          idColumn<DiyPageSummary>(),
          {
            // `textColumn` renders a plain string; the name doubles as the link
            // into the editor, so the render is replaced rather than duplicated.
            ...textColumn<DiyPageSummary>({
              title: '名称',
              dataIndex: 'name',
              ellipsis: true,
              sortable: true,
            }),
            render: (_value: unknown, row: DiyPageSummary) => (
              <Space size={4}>
                <Link href={`/admin/diy/${row.id}`}>{row.name}</Link>
                {row.isHome ? <Tag color="blue">首页</Tag> : null}
              </Space>
            ),
          },
          enumColumn<DiyPageSummary, DiyPageSummary['kind']>({
            title: '类型',
            dataIndex: 'kind',
            map: KIND_LABELS,
          }),
          enumColumn<DiyPageSummary, DiyPageSummary['status']>({
            title: '状态',
            dataIndex: 'status',
            map: STATUS_LABELS,
          }),
          textColumn<DiyPageSummary>({ title: '组件数', dataIndex: 'componentCount' }),
          instantColumn<DiyPageSummary>({
            title: '更新时间',
            dataIndex: 'updatedAt',
            sortable: true,
          }),
          actionsColumn<DiyPageSummary>({
            render: (row) => (
              <>
                <Link href={`/admin/diy/${row.id}`}>
                  <Button type="link" size="small">
                    装修
                  </Button>
                </Link>
                <Can permission="diy:page:publish">
                  <Button
                    type="link"
                    size="small"
                    loading={publish.isPending}
                    disabled={row.status === 'published'}
                    onClick={() => publish.mutate({ params: { id: row.id } })}
                  >
                    发布
                  </Button>
                </Can>
                {row.kind === 'micro' && !row.isHome ? null : (
                  <Can permission="diy:page:publish">
                    <ConfirmButton
                      route={diyPageSetHome}
                      input={{ params: { id: row.id } }}
                      title="将该页面设为商城首页？"
                      description="原来的首页会变回普通页面。"
                      invalidate={[diyPageList]}
                      successMessage="已设为首页"
                      buttonProps={{
                        type: 'link',
                        size: 'small',
                        disabled: row.isHome || row.kind !== 'home',
                      }}
                    >
                      设为首页
                    </ConfirmButton>
                  </Can>
                )}
                <Can permission="diy:page:create">
                  <ConfirmButton
                    route={diyPageCopy}
                    input={{ params: { id: row.id }, body: {} }}
                    title="复制这个页面？"
                    invalidate={[diyPageList]}
                    successMessage="已复制"
                    buttonProps={{ type: 'link', size: 'small' }}
                  >
                    复制
                  </ConfirmButton>
                </Can>
                <Can permission="diy:page:update">
                  <ConfirmButton
                    route={diyPageRestoreDefault}
                    input={{ params: { id: row.id } }}
                    title="还原为默认数据？"
                    description="当前页面内容会被主题自带的默认内容覆盖，且无法撤销。"
                    invalidate={[diyPageList]}
                    successMessage="已还原"
                    buttonProps={{ type: 'link', size: 'small' }}
                  >
                    还原默认
                  </ConfirmButton>
                </Can>
                <Can permission="diy:theme:update">
                  <ConfirmButton
                    route={diyPageSaveDefault}
                    input={{ params: { id: row.id } }}
                    title="将当前内容设为默认数据？"
                    description="之后在这个主题里“还原默认”都会回到现在的内容。"
                    invalidate={[diyPageList]}
                    successMessage="已保存为默认"
                    buttonProps={{ type: 'link', size: 'small' }}
                  >
                    设为默认
                  </ConfirmButton>
                </Can>
                <ConfirmButton
                  route={diyPageDelete}
                  input={{ params: { id: row.id } }}
                  title="确认删除该页面？"
                  invalidate={[diyPageList]}
                  successMessage="已删除"
                  permission="diy:page:delete"
                  buttonProps={{ type: 'link', size: 'small', danger: true, disabled: row.isHome }}
                >
                  删除
                </ConfirmButton>
              </>
            ),
          }),
        ]}
      />

      <ModalForm
        {...modal.props}
        title="新建页面"
        schema={diyPageCreateBody}
        fields={[
          { kind: 'text', name: 'name', label: '页面名称', placeholder: '仅后台可见' },
          {
            kind: 'select',
            name: 'kind',
            label: '页面类型',
            options: diyPageKind.options.map((value) => ({
              value,
              label: KIND_LABELS[value]?.label ?? value,
            })),
          },
          { kind: 'text', name: 'title', label: '标题栏文字', help: '留空则使用页面名称' },
        ]}
        initialValues={{ kind: 'micro' }}
        route={diyPageCreate}
        toInput={(values) => ({ body: values })}
        invalidate={[diyPageList]}
        successMessage="已创建"
      />
    </PageContainer>
  );
}
