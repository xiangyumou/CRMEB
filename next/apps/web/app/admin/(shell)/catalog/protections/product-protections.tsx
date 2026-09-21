'use client';

import { Button, Tag, Typography } from 'antd';
import {
  catalogAdminProtectionCreate,
  catalogAdminProtectionDelete,
  catalogAdminProtectionList,
  catalogAdminProtectionSetEnabled,
  catalogAdminProtectionUpdate,
} from '@shop/contracts/catalog/catalog.taxonomy.admin.contract';
import { productProtectionForm, type ProductProtection } from '@shop/contracts/catalog/schemas';

import { useRouteMutation } from '@/admin/api/hooks';
import { ConfirmButton } from '@/admin/kit/confirm-button';
import { ModalForm, useFormModal } from '@/admin/kit/form/modal-form';
import { PageContainer } from '@/admin/kit/page-container';
import {
  actionsColumn,
  idColumn,
  imageColumn,
  instantColumn,
  textColumn,
} from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { Can } from '@/admin/session/can';

import { BOOL_OPTIONS, protectionFields } from '../catalog-enums';

/**
 * 商品保障服务 — the 七天无理由退换 / 假一赔十 badges under the buy button.
 *
 * Its own page under its own permission atoms. Legacy registered these routes
 * in the route group whose `cate_name` said 商品参数
 * (`crmeb/app/adminapi/route/product.php:164`), so granting a merchandiser
 * "product parameters" also silently granted "edit the guarantees printed on
 * every product page". Brief: fix, don't port.
 */
export function ProductProtectionsPage() {
  const modal = useFormModal<ProductProtection>();

  const setEnabled = useRouteMutation(catalogAdminProtectionSetEnabled, {
    invalidate: [catalogAdminProtectionList],
    successMessage: '已更新状态',
  });

  return (
    <PageContainer subTitle="商品详情页展示的保障服务；停用后不再出现在新商品的可选项里">
      <CrudTable
        route={catalogAdminProtectionList}
        scrollX={1000}
        filters={[
          { kind: 'text', name: 'keyword', label: '服务名称' },
          { kind: 'select', name: 'isEnabled', label: '状态', options: BOOL_OPTIONS },
        ]}
        toolbar={
          <Can permission="catalog:protection:write">
            <Button type="primary" onClick={() => modal.show()}>
              新建保障服务
            </Button>
          </Can>
        }
        columns={[
          idColumn<ProductProtection>({ sortable: true }),
          imageColumn<ProductProtection>({ title: '图标', dataIndex: 'iconUrl', size: 32 }),
          textColumn<ProductProtection>({
            title: '服务名称',
            dataIndex: 'title',
            sortable: true,
          }),
          {
            title: '服务说明',
            key: 'content',
            render: (_value: unknown, row: ProductProtection) => (
              <Typography.Text type="secondary" ellipsis={{ tooltip: row.content ?? '' }}>
                {row.content?.trim() ? row.content : '—'}
              </Typography.Text>
            ),
          },
          {
            title: '状态',
            key: 'isEnabled',
            width: 90,
            render: (_value: unknown, row: ProductProtection) => (
              <Tag color={row.isEnabled ? 'success' : 'default'} bordered={false}>
                {row.isEnabled ? '启用' : '停用'}
              </Tag>
            ),
          },
          {
            title: '排序',
            key: 'sortOrder',
            width: 80,
            sorter: true,
            align: 'right' as const,
            render: (_value: unknown, row: ProductProtection) => row.sortOrder,
          },
          instantColumn<ProductProtection>({ title: '创建时间', dataIndex: 'createdAt' }),
          actionsColumn<ProductProtection>({
            width: 200,
            render: (row) => (
              <>
                <Can permission="catalog:protection:write">
                  <Button type="link" size="small" onClick={() => modal.show(row)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    loading={setEnabled.isPending}
                    onClick={() =>
                      setEnabled.mutate({
                        params: { id: row.id },
                        body: { isEnabled: !row.isEnabled },
                      })
                    }
                  >
                    {row.isEnabled ? '停用' : '启用'}
                  </Button>
                </Can>
                <ConfirmButton
                  route={catalogAdminProtectionDelete}
                  input={{ params: { id: row.id } }}
                  title="确认删除该保障服务？"
                  description="仍有商品在用时会被拒绝，先解除绑定。"
                  invalidate={[catalogAdminProtectionList]}
                  successMessage="已删除"
                  permission="catalog:protection:write"
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
        title={modal.record ? `编辑保障服务：${modal.record.title}` : '新建保障服务'}
        width={640}
        columns={3}
        schema={productProtectionForm}
        fields={protectionFields}
        initialValues={
          modal.record
            ? {
                title: modal.record.title,
                ...(modal.record.content === null ? {} : { content: modal.record.content }),
                ...(modal.record.iconUrl === null ? {} : { iconUrl: modal.record.iconUrl }),
                isEnabled: modal.record.isEnabled,
                sortOrder: modal.record.sortOrder,
              }
            : undefined
        }
        route={modal.record ? catalogAdminProtectionUpdate : catalogAdminProtectionCreate}
        toInput={(values) =>
          modal.record ? { params: { id: modal.record.id }, body: values } : { body: values }
        }
        invalidate={[catalogAdminProtectionList]}
        successMessage="已保存"
      />
    </PageContainer>
  );
}
