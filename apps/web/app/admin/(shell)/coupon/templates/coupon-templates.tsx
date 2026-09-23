'use client';

import { Button, Input, Modal, Space, Typography, message } from 'antd';
import { useState } from 'react';
import {
  couponAdminCreate,
  couponAdminDelete,
  couponAdminDetail,
  couponAdminGrant,
  couponAdminList,
  couponAdminSetStatus,
  couponAdminUpdate,
} from '@shop/contracts/coupon/coupon.admin.contract';
import {
  couponTemplateForm,
  type CouponTemplateDetail,
  type CouponTemplateListItem,
} from '@shop/contracts/coupon/schemas';

import { useRouteMutation } from '@/admin/api/hooks';
import { ConfirmButton } from '@/admin/kit/confirm-button';
import { ModalForm, useFormModal } from '@/admin/kit/form/modal-form';
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

import { COUPON_CLAIM_MODE, COUPON_SCOPE, COUPON_STATUS, couponFields } from '../coupon-enums';

/**
 * 优惠券列表 — the admin page the other 150 are meant to look like.
 *
 * Everything on this page comes from the kit and the contract:
 *
 *  - no `fetch`: `CrudTable` calls the route, and paging / sorting / filters
 *    live in the URL, so a filtered list is a link you can send a colleague;
 *  - no hand-written validation: `ModalForm` takes the contract's own body
 *    schema, including the cross-field rules that mirror the database CHECKs;
 *  - no permission logic beyond `<Can>` and `permission=`, which only hide
 *    things — the server re-checks the atom declared on each route.
 */
export function CouponTemplatesPage() {
  // The edit form loads the whole template first. The list row has
  // no `productIds` / `categoryIds`, and this page renders no control for
  // either, so a form seeded from the row would post the schema's `[]` default
  // and silently unlink every product a scoped coupon applied to.
  const modal = useFormModal<CouponTemplateListItem, typeof couponAdminDetail>({
    detail: {
      route: couponAdminDetail,
      params: (row) => ({ id: row.id }),
      select: initialValuesOf,
    },
  });
  const [granting, setGranting] = useState<CouponTemplateListItem | null>(null);

  const setStatus = useRouteMutation(couponAdminSetStatus, {
    invalidate: [couponAdminList],
    successMessage: '已更新状态',
  });

  return (
    <PageContainer subTitle="营销活动的优惠券模板；已领取的券在「已领取记录」里查">
      <CrudTable
        route={couponAdminList}
        scrollX={1400}
        filters={[
          { kind: 'text', name: 'keyword', label: '名称' },
          {
            kind: 'select',
            name: 'status',
            label: '状态',
            multiple: true,
            options: Object.entries(COUPON_STATUS).map(([value, option]) => ({
              value,
              label: option.label,
            })),
          },
          {
            kind: 'select',
            name: 'claimMode',
            label: '发放方式',
            options: Object.entries(COUPON_CLAIM_MODE).map(([value, option]) => ({
              value,
              label: option.label,
            })),
          },
        ]}
        toolbar={
          <Can permission="coupon:template:write">
            <Button type="primary" onClick={() => modal.show()}>
              新建优惠券
            </Button>
          </Can>
        }
        columns={[
          idColumn<CouponTemplateListItem>({ sortable: true }),
          textColumn<CouponTemplateListItem>({
            title: '名称',
            dataIndex: 'name',
            ellipsis: true,
            sortable: true,
          }),
          moneyColumn<CouponTemplateListItem>({
            title: '面额',
            dataIndex: 'discountAmount',
            sortable: true,
          }),
          moneyColumn<CouponTemplateListItem>({ title: '门槛', dataIndex: 'minSpend' }),
          enumColumn<CouponTemplateListItem, CouponTemplateListItem['scope']>({
            title: '适用范围',
            dataIndex: 'scope',
            map: COUPON_SCOPE,
          }),
          enumColumn<CouponTemplateListItem, CouponTemplateListItem['claimMode']>({
            title: '发放方式',
            dataIndex: 'claimMode',
            map: COUPON_CLAIM_MODE,
          }),
          {
            title: '库存 / 已发',
            key: 'supply',
            width: 140,
            render: (_value: unknown, row: CouponTemplateListItem) => (
              <Typography.Text>
                {row.isUnlimitedSupply ? '不限量' : `剩 ${row.remainingCount ?? 0}`}
                <Typography.Text type="secondary"> / 已发 {row.issuedCount}</Typography.Text>
              </Typography.Text>
            ),
          },
          {
            title: '状态',
            key: 'status',
            width: 100,
            render: (_value: unknown, row: CouponTemplateListItem) => (
              <StatusTag value={row.status} map={COUPON_STATUS} />
            ),
          },
          instantColumn<CouponTemplateListItem>({
            title: '创建时间',
            dataIndex: 'createdAt',
            sortable: true,
          }),
          actionsColumn<CouponTemplateListItem>({
            width: 220,
            render: (row) => (
              <>
                <Can permission="coupon:template:write">
                  <Button type="link" size="small" onClick={() => modal.show(row)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    loading={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({
                        params: { id: row.id },
                        body: { status: row.status === 'active' ? 'disabled' : 'active' },
                      })
                    }
                  >
                    {row.status === 'active' ? '停用' : '启用'}
                  </Button>
                </Can>
                <Can permission="coupon:grant:write">
                  <Button type="link" size="small" onClick={() => setGranting(row)}>
                    发放
                  </Button>
                </Can>
                <ConfirmButton
                  route={couponAdminDelete}
                  input={{ params: { id: row.id } }}
                  title="确认删除该优惠券？"
                  description="已领取的优惠券不受影响，仍可正常使用。"
                  invalidate={[couponAdminList]}
                  successMessage="已删除"
                  permission="coupon:template:delete"
                  buttonProps={{ type: 'link', size: 'small', danger: true }}
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
        title={modal.record ? `编辑：${modal.record.name}` : '新建优惠券'}
        width={900}
        columns={2}
        schema={couponTemplateForm}
        fields={couponFields}
        route={modal.record ? couponAdminUpdate : couponAdminCreate}
        toInput={(values) =>
          modal.record ? { params: { id: modal.record.id }, body: values } : { body: values }
        }
        invalidate={[couponAdminList]}
        successMessage="已保存"
      />

      <GrantModal template={granting} onClose={() => setGranting(null)} />
    </PageContainer>
  );
}

/**
 * The detail minus the fields the form does not own (`remainingCount`,
 * `issuedCount`, `createdAt`), with `null` turned into `undefined`:
 * `exactOptionalPropertyTypes` means an optional field is either absent or a
 * real value, never `null`.
 *
 * `productIds` and `categoryIds` are carried through even though no control
 * renders them: they are part of the update body, so leaving them out means
 * sending `[]`. They ride in the form's initial values, which antd keeps in
 * its store whether or not a field registers for them, and come back out of
 * `onFinish` unchanged.
 */
function initialValuesOf(row: CouponTemplateDetail) {
  return {
    productIds: row.productIds,
    categoryIds: row.categoryIds,
    name: row.name,
    scope: row.scope,
    claimMode: row.claimMode,
    status: row.status,
    discountAmount: row.discountAmount,
    minSpend: row.minSpend,
    validityMode: row.validityMode,
    ...(row.validFrom === null ? {} : { validFrom: row.validFrom }),
    ...(row.validTo === null ? {} : { validTo: row.validTo }),
    ...(row.validDays === null ? {} : { validDays: row.validDays }),
    ...(row.claimFrom === null ? {} : { claimFrom: row.claimFrom }),
    ...(row.claimTo === null ? {} : { claimTo: row.claimTo }),
    isUnlimitedSupply: row.isUnlimitedSupply,
    ...(row.totalCount === null ? {} : { totalCount: row.totalCount }),
    ...(row.perUserLimit === null ? {} : { perUserLimit: row.perUserLimit }),
    ...(row.giftMinOrderAmount === null ? {} : { giftMinOrderAmount: row.giftMinOrderAmount }),
    sortOrder: row.sortOrder,
  };
}

/**
 * 发放给指定用户.
 *
 * Deliberately a plain textarea of user ids rather than a user picker: an
 * operator pasting a list out of a spreadsheet is the actual workflow. The
 * result reports how many were skipped for already holding the maximum, which is
 * normal when a group overlaps a previous grant.
 */
function GrantModal({
  template,
  onClose,
}: {
  template: CouponTemplateListItem | null;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState('');
  const grant = useRouteMutation(couponAdminGrant, {
    invalidate: [couponAdminList],
  });

  const close = () => {
    setRaw('');
    onClose();
  };

  return (
    <Modal
      open={template !== null}
      title={template ? `发放：${template.name}` : '发放优惠券'}
      okText="发放"
      confirmLoading={grant.isPending}
      onCancel={close}
      onOk={() => {
        const userIds = raw
          .split(/[\s,，、]+/)
          .map((value) => value.trim())
          .filter(Boolean);
        if (userIds.length === 0 || !template) {
          void message.warning('请填写至少一个用户 ID');
          return;
        }
        grant.mutate(
          { params: { id: template.id }, body: { userIds } },
          {
            onSuccess: (result) => {
              void message.success(
                result.skippedUserIds.length === 0
                  ? `已发放 ${result.granted} 张`
                  : `已发放 ${result.granted} 张，${result.skippedUserIds.length} 位用户已达上限`,
              );
              close();
            },
          },
        );
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          粘贴用户 ID，空格、逗号或换行分隔，最多 200 个。库存不足时整批不发放。
        </Typography.Text>
        <Input.TextArea
          rows={6}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder="1001 1002 1003"
        />
      </Space>
    </Modal>
  );
}
