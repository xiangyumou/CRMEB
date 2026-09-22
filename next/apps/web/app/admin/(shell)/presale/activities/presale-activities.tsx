'use client';

import { Button, Modal, Skeleton, Typography } from 'antd';
import { useState } from 'react';
import {
  presaleAdminActivityCreate,
  presaleAdminActivityDelete,
  presaleAdminActivityDetail,
  presaleAdminActivityList,
  presaleAdminActivitySetStatus,
  presaleAdminActivityUpdate,
} from '@shop/contracts/presale/presale.admin.contract';
import {
  presaleActivityForm,
  type PresaleActivityDetail,
  type PresaleActivityListItem,
} from '@shop/contracts/presale/schemas';

import { useRouteMutation, useRouteQuery } from '@/admin/api/hooks';
import { ConfirmButton } from '@/admin/kit/confirm-button';
import { ModalForm } from '@/admin/kit/form/modal-form';
import { PageContainer } from '@/admin/kit/page-container';
import { StatusTag } from '@/admin/kit/status-tag';
import {
  actionsColumn,
  enumColumn,
  idColumn,
  instantColumn,
  moneyColumn,
  textColumn,
} from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { Can } from '@/admin/session/can';

import { PRESALE_ACTIVITY_STATUS, PRESALE_PAYMENT_MODE, presaleFields } from '../presale-enums';

/**
 * 预售活动.
 *
 * Everything on this page comes from the kit and the contract: `CrudTable`
 * calls the route and keeps paging, sorting and filters in the URL; `ModalForm`
 * takes the contract's own body schema, including `endAt > startAt` and the
 * duplicate-SKU check; `<Can>` and `permission=` only hide things, and the
 * server re-checks the atom declared on each route.
 *
 * 启用/暂停 is one click because that is the operation an operator performs in a
 * hurry — a campaign priced wrong has to stop selling now, not after a modal.
 * 结束 is deliberately not offered: `ended` is terminal, it is what the window
 * sweep writes when the campaign's own end time passes, and an operator who
 * wants it gone sooner moves the end time or deletes it.
 */
export function PresaleActivitiesPage() {
  const [editing, setEditing] = useState<PresaleActivityListItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const setStatus = useRouteMutation(presaleAdminActivitySetStatus, {
    invalidate: [presaleAdminActivityList],
    successMessage: '已更新状态',
  });

  const open = (row?: PresaleActivityListItem) => {
    setEditing(row ?? null);
    setFormOpen(true);
  };

  return (
    <PageContainer subTitle="全款预售：付款后按承诺天数发货；预售库存与商品库存各记各的">
      <CrudTable
        route={presaleAdminActivityList}
        scrollX={1500}
        filters={[
          { kind: 'text', name: 'keyword', label: '标题' },
          {
            kind: 'select',
            name: 'status',
            label: '状态',
            multiple: true,
            options: Object.entries(PRESALE_ACTIVITY_STATUS).map(([value, option]) => ({
              value,
              label: option.label,
            })),
          },
          { kind: 'number', name: 'productId', label: '商品 ID', min: 1 },
        ]}
        toolbar={
          <Can permission="presale:activity:write">
            <Button type="primary" onClick={() => open()}>
              新建预售活动
            </Button>
          </Can>
        }
        columns={[
          idColumn<PresaleActivityListItem>({ sortable: true }),
          textColumn<PresaleActivityListItem>({
            title: '活动标题',
            dataIndex: 'title',
            ellipsis: true,
          }),
          textColumn<PresaleActivityListItem>({
            title: '商品',
            dataIndex: 'productName',
            ellipsis: true,
          }),
          moneyColumn<PresaleActivityListItem>({ title: '预售价', dataIndex: 'price' }),
          {
            title: '库存 / 已售',
            key: 'supply',
            width: 160,
            render: (_value: unknown, row: PresaleActivityListItem) => (
              <Typography.Text>
                剩 {row.stock}
                <Typography.Text type="secondary"> / 已售 {row.sales}</Typography.Text>
                {row.totalQuota === null ? null : (
                  <Typography.Text type="secondary"> / 限 {row.totalQuota}</Typography.Text>
                )}
              </Typography.Text>
            ),
          },
          {
            title: '发货承诺',
            key: 'shipAfterDays',
            width: 130,
            render: (_value: unknown, row: PresaleActivityListItem) =>
              row.shipAfterDays === 0 ? '付款后即发' : `付款后 ${row.shipAfterDays} 天内`,
          },
          instantColumn<PresaleActivityListItem>({
            title: '开始时间',
            dataIndex: 'startAt',
            sortable: true,
          }),
          instantColumn<PresaleActivityListItem>({ title: '结束时间', dataIndex: 'endAt' }),
          enumColumn<PresaleActivityListItem, PresaleActivityListItem['paymentMode']>({
            title: '付款方式',
            dataIndex: 'paymentMode',
            map: PRESALE_PAYMENT_MODE,
          }),
          {
            title: '状态',
            key: 'status',
            width: 100,
            render: (_value: unknown, row: PresaleActivityListItem) => (
              <StatusTag value={row.status} map={PRESALE_ACTIVITY_STATUS} />
            ),
          },
          actionsColumn<PresaleActivityListItem>({
            width: 180,
            render: (row) => (
              <>
                <Can permission="presale:activity:write">
                  <Button type="link" size="small" onClick={() => open(row)}>
                    编辑
                  </Button>
                  {row.status === 'ended' ? null : (
                    <Button
                      type="link"
                      size="small"
                      loading={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({
                          params: { id: row.id },
                          body: { status: row.status === 'active' ? 'paused' : 'active' },
                        })
                      }
                    >
                      {row.status === 'active' ? '暂停' : '启用'}
                    </Button>
                  )}
                </Can>
                <ConfirmButton
                  route={presaleAdminActivityDelete}
                  input={{ params: { id: row.id } }}
                  title="确认删除该预售活动？"
                  description="还有未完成预售订单时无法删除；已完成的订单不受影响。"
                  invalidate={[presaleAdminActivityList]}
                  successMessage="已删除"
                  permission="presale:activity:delete"
                  buttonProps={{ type: 'link', size: 'small', danger: true }}
                >
                  删除
                </ConfirmButton>
              </>
            ),
          }),
        ]}
      />

      <ActivityFormModal
        open={formOpen}
        editingId={editing?.id ?? null}
        heading={editing ? `编辑：${editing.title}` : '新建预售活动'}
        onClose={() => setFormOpen(false)}
      />
    </PageContainer>
  );
}

/**
 * The create/edit dialog.
 *
 * Editing loads the **detail** route first and waits for it. The list row does
 * not carry `skus` or `sliderImages`, and `presaleAdminActivityUpdate` takes a
 * whole activity: opening the form on a list row would submit an empty 规格
 * list and silently delete every presale price on the campaign. Waiting for one
 * request is the cheap half of that trade.
 */
function ActivityFormModal({
  open,
  editingId,
  heading,
  onClose,
}: {
  open: boolean;
  editingId: string | null;
  heading: string;
  onClose: () => void;
}) {
  const detail = useRouteQuery(
    presaleAdminActivityDetail,
    { params: { id: editingId ?? '0' } },
    { enabled: open && editingId !== null },
  );

  if (open && editingId !== null && detail.data === undefined) {
    return (
      <Modal open title={heading} footer={null} onCancel={onClose} width={960}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Modal>
    );
  }

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      title={heading}
      width={960}
      columns={2}
      schema={presaleActivityForm}
      fields={presaleFields}
      initialValues={detail.data && editingId !== null ? initialValuesOf(detail.data) : undefined}
      route={editingId === null ? presaleAdminActivityCreate : presaleAdminActivityUpdate}
      toInput={(values) =>
        editingId === null ? { body: values } : { params: { id: editingId }, body: values }
      }
      invalidate={[presaleAdminActivityList, presaleAdminActivityDetail]}
      successMessage="已保存"
    />
  );
}

/**
 * The detail row as the form's values: the server's own fields minus the ones
 * it owns (`sales`, `productName`, `createdAt`), with `null` turned into
 * `undefined` — `exactOptionalPropertyTypes` means an optional field is either
 * absent or a real value, never `null`.
 */
function initialValuesOf(row: PresaleActivityDetail) {
  return {
    productId: row.productId,
    title: row.title,
    ...(row.intro === null ? {} : { intro: row.intro }),
    ...(row.imageUrl === null ? {} : { imageUrl: row.imageUrl }),
    sliderImages: row.sliderImages,
    status: row.status,
    paymentMode: 'full' as const,
    price: row.price,
    ...(row.originalPrice === null ? {} : { originalPrice: row.originalPrice }),
    stock: row.stock,
    ...(row.totalQuota === null ? {} : { totalQuota: row.totalQuota }),
    perOrderQuantity: row.perOrderQuantity,
    startAt: row.startAt,
    endAt: row.endAt,
    shipAfterDays: row.shipAfterDays,
    ...(row.shippingTemplateId === null ? {} : { shippingTemplateId: row.shippingTemplateId }),
    sortOrder: row.sortOrder,
    skus: row.skus.map((sku) => ({
      skuId: sku.skuId,
      price: sku.price,
      stock: sku.stock,
      ...(sku.quota === null ? {} : { quota: sku.quota }),
      isEnabled: sku.isEnabled,
    })),
  };
}
