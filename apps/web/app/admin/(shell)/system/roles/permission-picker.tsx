'use client';

import { Alert, Checkbox, Empty, Space, Spin, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { systemPermissionTree } from '@shop/contracts/system/system.role.contract';

import { useRouteQuery } from '@/admin/api/hooks';

/**
 * The permission picker inside the role form.
 *
 * The tree comes from `/admin-api/permissions`, which builds it from the atoms
 * the **code** declares — there is no permission table to drift from. Two
 * consequences show up here:
 *
 *  - implicit atoms (every logged-in admin has them: read your own profile,
 *    log out) are rendered checked and disabled, so nobody tries to grant them;
 *  - an atom stored on the role that the code no longer declares is listed
 *    separately as 已失效, because it grants nothing but only an operator can
 *    decide to clear it.
 */
export function PermissionPicker({
  value = [],
  onChange,
  unknownPermissions = [],
}: {
  value?: string[] | undefined;
  onChange?: ((next: string[]) => void) | undefined;
  unknownPermissions?: readonly string[] | undefined;
}) {
  const tree = useRouteQuery(systemPermissionTree);
  const implicit = useMemo(() => new Set(tree.data?.implicit ?? []), [tree.data]);
  const selected = useMemo(() => new Set(value), [value]);

  if (tree.isPending) return <Spin />;
  if (!tree.data || tree.data.sections.length === 0)
    return <Empty description="没有可分配的权限" />;

  const toggleSection = (atoms: string[], checked: boolean): void => {
    const next = new Set(selected);
    for (const atom of atoms) {
      if (checked) next.add(atom);
      else next.delete(atom);
    }
    onChange?.([...next]);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {unknownPermissions.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="该身份存有已失效的权限"
          description={
            <Space wrap>
              <Typography.Text type="secondary">
                下列权限在当前版本中已不存在，不会生效；保存时会被自动清除：
              </Typography.Text>
              {unknownPermissions.map((atom) => (
                <Tag key={atom}>{atom}</Tag>
              ))}
            </Space>
          }
        />
      )}

      {tree.data.sections.map((section) => {
        const atoms = section.items.map((item) => item.atom).filter((atom) => !implicit.has(atom));
        const checkedCount = atoms.filter((atom) => selected.has(atom)).length;
        return (
          <div key={section.section}>
            <Checkbox
              checked={atoms.length > 0 && checkedCount === atoms.length}
              indeterminate={checkedCount > 0 && checkedCount < atoms.length}
              onChange={(event) => toggleSection(atoms, event.target.checked)}
            >
              <Typography.Text strong>{section.section}</Typography.Text>
            </Checkbox>
            <div style={{ paddingLeft: 24, paddingTop: 4 }}>
              <Space wrap size={[16, 8]}>
                {section.items.map((item) => {
                  const isImplicit = implicit.has(item.atom);
                  return (
                    <Checkbox
                      key={item.atom}
                      checked={isImplicit || selected.has(item.atom)}
                      disabled={isImplicit}
                      onChange={(event) => toggleSection([item.atom], event.target.checked)}
                    >
                      {item.label}
                      {isImplicit && (
                        <Typography.Text type="secondary"> （默认拥有）</Typography.Text>
                      )}
                    </Checkbox>
                  );
                })}
              </Space>
            </div>
          </div>
        );
      })}
    </Space>
  );
}
