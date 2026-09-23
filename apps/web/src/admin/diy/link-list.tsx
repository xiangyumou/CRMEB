'use client';

import {
  diyLinkCategoryList,
  diyLinkCreate,
  diyLinkDelete,
  diyLinkList,
  diyLinkUpdate,
} from '@shop/contracts/diy/diy.contract';
import { diyLinkBody, type DiyLink } from '@shop/contracts/diy/schemas';
import { Button, Tag } from 'antd';

import { useRouteQuery } from '../api';
import {
  ConfirmButton,
  CrudTable,
  ModalForm,
  PageContainer,
  actionsColumn,
  idColumn,
  textColumn,
  useFormModal,
} from '../kit';
import { Can } from '../session';

/**
 * 页面链接 — the registry `<LinkPicker>` offers under 商城页面.
 *
 * The rows are editable, not a fixed seed: a shop that adds a page must be able
 * to make it linkable.
 */

export function DiyLinkList() {
  const modal = useFormModal<DiyLink>();
  const categories = useRouteQuery(diyLinkCategoryList);
  const categoryOptions = (categories.data?.items ?? []).map((category) => ({
    value: category.id,
    label: category.name,
  }));
  const categoryName = new Map((categories.data?.items ?? []).map((c) => [c.id, c.name]));

  return (
    <PageContainer
      title="页面链接"
      subTitle="装修组件里可以选择的商城页面"
      extra={
        <Can permission="diy:link:update">
          <Button type="primary" onClick={() => modal.show()}>
            新增链接
          </Button>
        </Can>
      }
    >
      <CrudTable
        route={diyLinkList}
        fixedQuery={{ includeDisabled: 'true' }}
        filters={[
          { kind: 'text', name: 'keyword', label: '名称或地址' },
          { kind: 'select', name: 'categoryId', label: '分类', options: categoryOptions },
        ]}
        columns={[
          idColumn<DiyLink>(),
          textColumn<DiyLink>({ title: '名称', dataIndex: 'name' }),
          {
            ...textColumn<DiyLink>({ title: '分类', dataIndex: 'categoryId' }),
            render: (_value: unknown, row: DiyLink) =>
              categoryName.get(row.categoryId ?? '') ?? '—',
          },
          textColumn<DiyLink>({ title: '地址', dataIndex: 'url', ellipsis: true }),
          textColumn<DiyLink>({ title: '参数名', dataIndex: 'paramName' }),
          {
            ...textColumn<DiyLink>({ title: '状态', dataIndex: 'isEnabled' }),
            render: (_value: unknown, row: DiyLink) =>
              row.isEnabled ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
          },
          actionsColumn<DiyLink>({
            render: (row) => (
              <>
                <Can permission="diy:link:update">
                  <Button type="link" size="small" onClick={() => modal.show(row)}>
                    编辑
                  </Button>
                </Can>
                <ConfirmButton
                  route={diyLinkDelete}
                  input={{ params: { id: row.id } }}
                  title="确认删除该链接？"
                  invalidate={[diyLinkList]}
                  successMessage="已删除"
                  permission="diy:link:update"
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
        title={modal.record ? '编辑链接' : '新增链接'}
        schema={diyLinkBody}
        fields={[
          { kind: 'text', name: 'name', label: '名称' },
          { kind: 'select', name: 'categoryId', label: '分类', options: categoryOptions },
          { kind: 'text', name: 'url', label: '地址', placeholder: '/pages/index/index' },
          { kind: 'text', name: 'paramName', label: '参数名', help: '需要拼 id 时填写，如 id' },
          { kind: 'text', name: 'example', label: '示例', help: '带参数的完整地址示例' },
          { kind: 'number', name: 'sortOrder', label: '排序', min: 0, max: 9999 },
          { kind: 'switch', name: 'isEnabled', label: '启用' },
        ]}
        initialValues={modal.record ?? { isEnabled: true, sortOrder: 0 }}
        route={modal.record ? diyLinkUpdate : diyLinkCreate}
        toInput={(values) =>
          modal.record ? { params: { id: modal.record.id }, body: values } : { body: values }
        }
        invalidate={[diyLinkList]}
        successMessage="已保存"
      />
    </PageContainer>
  );
}
