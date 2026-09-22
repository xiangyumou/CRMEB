'use client';

import { Alert, Button, Tag, Tooltip, Typography } from 'antd';
import {
  wechatOaMenuCreate,
  wechatOaMenuCurrent,
  wechatOaMenuDelete,
  wechatOaMenuList,
  wechatOaMenuPublish,
  wechatOaMenuUpdate,
} from '@shop/contracts/wechat-oa/wechat-oa.menu.contract';
import { wechatMenuForm, type WechatMenu } from '@shop/contracts/wechat-oa/schemas';

import { useRouteQuery } from '@/admin/api/hooks';
import { ConfirmButton } from '@/admin/kit/confirm-button';
import { ModalForm, useFormModal } from '@/admin/kit/form/modal-form';
import { PageContainer } from '@/admin/kit/page-container';
import { actionsColumn, idColumn, instantColumn, textColumn } from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { Can } from '@/admin/session/can';
import { MenuTreeEditor } from '@/admin/wechat-oa/menu-tree-editor';

/**
 * 自定义菜单 — the bottom menu of the Official Account.
 *
 * Saving and publishing are two buttons because they are two decisions. The
 * legacy screen had one, so a WeChat outage lost the operator's edits and a
 * typo went live the moment it was typed. Here a menu is a row, several may be
 * kept side by side (a 春节 menu next to the everyday one), and only 发布
 * touches `cgi-bin/menu/create` — which is also why it holds its own
 * permission atom.
 */
export function WechatMenusPage() {
  const modal = useFormModal<WechatMenu>();
  const current = useRouteQuery(wechatOaMenuCurrent);

  return (
    <PageContainer subTitle="保存只改草稿，发布才会改变关注者手机上看到的菜单">
      {current.data?.publishError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="上次发布失败"
          description={current.data.publishError}
        />
      ) : null}

      <CrudTable
        route={wechatOaMenuList}
        toolbar={
          <Can permission="wechat-oa:menu:write">
            <Button type="primary" onClick={() => modal.show()}>
              新建菜单
            </Button>
          </Can>
        }
        columns={[
          idColumn<WechatMenu>(),
          textColumn<WechatMenu>({ title: '名称', dataIndex: 'name', ellipsis: true }),
          {
            title: '按钮',
            key: 'buttons',
            render: (_value: unknown, row: WechatMenu) => (
              <Typography.Text type="secondary">{describe(row)}</Typography.Text>
            ),
          },
          {
            title: '状态',
            key: 'isActive',
            width: 110,
            render: (_value: unknown, row: WechatMenu) =>
              row.isActive ? <Tag color="success">已生效</Tag> : <Tag color="default">草稿</Tag>,
          },
          instantColumn<WechatMenu>({ title: '发布时间', dataIndex: 'publishedAt' }),
          actionsColumn<WechatMenu>({
            width: 200,
            render: (row) => (
              <>
                <Can permission="wechat-oa:menu:write">
                  <Button type="link" size="small" onClick={() => modal.show(row)}>
                    编辑
                  </Button>
                </Can>
                <ConfirmButton
                  route={wechatOaMenuPublish}
                  input={{ params: { id: row.id } }}
                  title="确认发布这套菜单？"
                  description="发布后，所有关注者的底部菜单会在几分钟内变成这一套。"
                  invalidate={[wechatOaMenuList, wechatOaMenuCurrent]}
                  successMessage="已发布到微信"
                  permission="wechat-oa:menu:publish"
                  buttonProps={{ type: 'link', size: 'small' }}
                >
                  发布
                </ConfirmButton>
                <Tooltip title={row.isActive ? '生效中的菜单不能删除，先发布另一套' : ''}>
                  <span>
                    <ConfirmButton
                      route={wechatOaMenuDelete}
                      input={{ params: { id: row.id } }}
                      title="确认删除该菜单？"
                      description="微信上已经生效的菜单不会因此消失。"
                      invalidate={[wechatOaMenuList]}
                      successMessage="已删除"
                      permission="wechat-oa:menu:write"
                      buttonProps={{
                        type: 'link',
                        size: 'small',
                        danger: true,
                        disabled: row.isActive,
                      }}
                    >
                      删除
                    </ConfirmButton>
                  </span>
                </Tooltip>
              </>
            ),
          }),
        ]}
      />

      <ModalForm
        {...modal.props}
        title={modal.record ? `编辑：${modal.record.name}` : '新建菜单'}
        width={860}
        schema={wechatMenuForm}
        fields={[
          { kind: 'text', name: 'name', label: '名称', placeholder: '例如「春节菜单」' },
          {
            kind: 'custom',
            name: 'buttons',
            label: '按钮',
            help: '最多 3 个一级按钮，每个下面最多 5 个子菜单。',
            render: ({ value, onChange, disabled }) => (
              <MenuTreeEditor
                value={Array.isArray(value) ? value : []}
                onChange={onChange}
                disabled={disabled}
              />
            ),
          },
        ]}
        initialValues={
          modal.record
            ? { name: modal.record.name, buttons: modal.record.buttons }
            : { name: '', buttons: [{ name: '', type: 'view', url: '' }] }
        }
        route={modal.record ? wechatOaMenuUpdate : wechatOaMenuCreate}
        toInput={(values) =>
          modal.record ? { params: { id: modal.record.id }, body: values } : { body: values }
        }
        invalidate={[wechatOaMenuList, wechatOaMenuCurrent]}
        successMessage="已保存草稿"
      />
    </PageContainer>
  );
}

/** "商城（2） · 联系客服" — enough to tell two drafts apart without opening them. */
function describe(menu: WechatMenu): string {
  if (menu.buttons.length === 0) return '（空）';
  return menu.buttons
    .map((button) => {
      const children = button.sub_button ?? [];
      return children.length > 0 ? `${button.name}（${children.length}）` : button.name;
    })
    .join(' · ');
}
