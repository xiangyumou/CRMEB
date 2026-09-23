# 后台组件套件（admin kit）

约 150 个后台页面都由这里的组件拼出来。**页面里不要写 `fetch`，不要自己拼 antd 表格/表单，不要复制一份私有版本**；缺东西就在 kit 里补，补好之前先在本地加适配层继续。

可运行的示例在 `/admin/dev/kit`（源码 `app/admin/(shell)/dev/kit/`），每个组件都有一屏。

- 所有文案中文，没有 i18n 层。
- 金额是字符串 `"12.00"`，任何地方都不要转成 `number`。
- 时间是带时区的 ISO-8601，展示统一按 `Asia/Shanghai`。
- 权限原子形如 `<domain>:<resource>:<action>`；`isSuper` 一律放行。

---

## 一页 CRUD 长什么样

```tsx
'use client';

import { Button } from 'antd';
import { couponCreate, couponDelete, couponList, couponUpdate } from '@shop/contracts';
import {
  CrudTable,
  ModalForm,
  PageContainer,
  ConfirmButton,
  useFormModal,
  actionsColumn,
  enumColumn,
  idColumn,
  instantColumn,
  moneyColumn,
  textColumn,
} from '@/admin/kit';
import { Can } from '@/admin/session';

export default function CouponListPage() {
  const modal = useFormModal<Coupon>();

  return (
    <PageContainer
      extra={
        <Can permission="coupon:template:create">
          <Button type="primary" onClick={() => modal.show()}>
            新建优惠券
          </Button>
        </Can>
      }
    >
      <CrudTable
        route={couponList}
        filters={[
          { kind: 'text', name: 'keyword', label: '名称' },
          { kind: 'select', name: 'status', label: '状态', options: statusOptions(COUPON_STATUS) },
          { kind: 'dateRange', names: ['createdFrom', 'createdTo'], label: '创建时间' },
        ]}
        columns={[
          idColumn(),
          textColumn({ title: '名称', dataIndex: 'name', ellipsis: true }),
          moneyColumn({ title: '面额', dataIndex: 'value', sortable: true }),
          enumColumn({ title: '状态', dataIndex: 'status', map: COUPON_STATUS }),
          instantColumn({ title: '创建时间', dataIndex: 'createdAt', sortable: true }),
          actionsColumn({
            render: (row) => (
              <>
                <Button type="link" size="small" onClick={() => modal.show(row)}>
                  编辑
                </Button>
                <ConfirmButton
                  route={couponDelete}
                  input={{ params: { id: row.id } }}
                  title="确认删除该优惠券？"
                  invalidate={[couponList]}
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
        title={modal.record ? '编辑优惠券' : '新建优惠券'}
        schema={couponCreate.body}
        fields={couponFields}
        initialValues={modal.record}
        route={modal.record ? couponUpdate : couponCreate}
        toInput={(values) =>
          modal.record ? { params: { id: modal.record.id }, body: values } : { body: values }
        }
        invalidate={[couponList]}
        successMessage="已保存"
      />
    </PageContainer>
  );
}
```

---

## 数据访问

`src/admin/api/`。这就是约定里说的"生成的客户端"——生成的是类型，没有代码生成步骤。

| API                                                                      | 说明                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `callRoute(route, input?, options?)`                                     | 按 `RouteDef` 发请求。`input` 为 `{ params, query, body }`（上传时用 `formData` 代替 `body`，见下）；URL 由 `:param` 占位符拼出，query 有序序列化（`undefined`/`null`/`""` 丢弃，数组重复键，`Date` 转 ISO），带 cookie，非 2xx 抛 `ApiError`。`options.onUnauthorized: 'throw'` 可以关掉 401 自动跳登录（登录页和 `SessionProvider` 用）。 |
| `useRouteQuery(route, input?, options?)`                                 | `useQuery` 包装。query key = `[route.id, { params, query }]`。`options.presentError: false` 关掉全局报错提示。                                                                                                                                                                                                                              |
| `useRouteMutation(route, options?)`                                      | `useMutation` 包装。`mutate({ body })`；`invalidate: [routes…]` 成功后失效这些路由的全部缓存；`successMessage` 弹成功提示。                                                                                                                                                                                                                 |
| `useInvalidateRoutes()`                                                  | 手动失效，返回 `(...routes) => Promise<void>`。                                                                                                                                                                                                                                                                                             |
| `ApiError`                                                               | `{ status, code, message, details }`，外加 `fieldErrors` 取 422 的字段错误。分支判断请用 `code`，不要用 `message`。                                                                                                                                                                                                                         |
| `configureApi({ baseUrl, fetch, onUnauthenticated, validateResponses })` | 测试与演示页用；`validateResponses` 开发环境默认开，会用契约校验响应。                                                                                                                                                                                                                                                                      |

错误提示是全局的：TanStack Query 的 cache 级 `onError` 统一弹 `message`/`notification`，401 和被取消的请求不弹。单次调用可用 `presentError: false` 退出（表单默认就是 `false`，自己展示字段错误）。

**上传文件。** `multipart/form-data` 的分隔符只能由浏览器生成，所以传
`input.formData`（一个 `FormData`）而不是 `body`：请求**不带 `Content-Type`**，
`body` 被忽略，`fetch` 之后的一切——URL 拼接、`credentials: 'include'`、
`ApiError` 映射、401 跳登录、取消映射、响应校验——和普通路由完全一样。对应地，
多部分路由在契约里**不声明 `body`**（`handle()` 只解析 JSON body），可选项放在
`query` 里。

单个文件用 `uploadFile(route, { params, query }, file, { signal, fieldName })`
（`@/admin/storage/upload`）：它只是帮你拼出服务端约定的那一个字段（默认
`file`），其余都走 `callRoute`。

```ts
await callRoute(storageAttachmentUpload, { query: { categoryId }, formData });
await uploadFile(storageScanUpload, { params: { token } }, file);
```

**输入类型说明。** `params`/`query`/`body` 三个键都是可选的：`defineRoute` 的泛型在路由没声明某一项时会退化成 `z.ZodType`，若做成"声明了就必填"，没有 params 的路由反而会被要求传 `params`。传值时类型仍然完整校验。`query`/`body` 用 `z.input`，所以 schema 的默认值和 coercion 在调用处可省。

---

## 组件一览

### 布局与展示

| 组件                                                | 主要 props                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PageContainer`                                     | `title?` `subTitle?` `extra?` `breadcrumb?: BreadcrumbEntry[] \| false` `tabs?` `footer?` — 标题默认取当前菜单节点，面包屑默认由菜单树推导，详情页可用 `breadcrumb` 覆盖 |
| `DescriptionsCard`                                  | `title?` `extra?` `items: { label, value, span?, hidden? }[]` `column?=3` `loading?` `bordered?=true`                                                                    |
| `MoneyText`                                         | `value: string \| null` `symbol?='¥'` `grouped?=true` `colored?=false` `placeholder?='—'` `strong?`                                                                      |
| `InstantText`                                       | `value: string \| null` `format?: 'datetime'\|'minute'\|'date'\|'time'\|'relative'` `tooltip?`                                                                           |
| `StatusTag`                                         | `value` `map: StatusMap` `bordered?` — 配 `statusOptions(map)` 给筛选/表单用同一份枚举                                                                                   |
| `ConfirmButton`                                     | `route` `input?`（可为函数） `title` `description?` `invalidate?` `successMessage?` `onSuccess?` `permission?` `buttonProps?`                                            |
| `Can` / `RequirePermission` / `requirePermission()` | 见 `src/admin/session/`                                                                                                                                                  |

### CrudTable

```
route        列表 RouteDef，响应必须是 paged(item)
columns      antd ColumnsType，用下面的列助手拼
rowKey       默认 'id'
filters      FilterSpec[]，name 就是路由的 query 键
params       嵌套列表的路径参数
fixedQuery   不进 URL、不进筛选栏的固定 query
toolbar      左上角插槽（新建按钮等）
batchActions ({ selectedRowKeys, selectedRows, clear }) => ReactNode，传了才开启多选
urlPrefix    一页多个表格时给 URL 键加命名空间
sortKeys     排序 query 键，默认 { field: 'sortBy', order: 'sortOrder' }
scrollX / size / expandable / emptyText / title / bordered / onData
```

分页、排序、筛选都同步到 URL search params（`page` `pageSize` `sort=field:asc` + 各筛选键），所以筛过的列表是可以直接发给同事的链接，刷新也不丢。排序发给后端的是 `sortBy` + `sortOrder=asc|desc`——**契约的 query 里请按这两个键声明**。多选筛选在 URL 里是 `a,b`，发给后端是重复键 `?status=a&status=b`。

列助手：`idColumn()` `textColumn({ellipsis})` `moneyColumn()` `instantColumn({format})` `imageColumn({size})` `enumColumn({map})` `actionsColumn({render})`。带 `sortable: true` 即开启服务端排序。

筛选类型：`text` `number` `select`（`multiple`） `dateRange`（`names: [开始键, 结束键]`） `custom`（`render(value, onChange)`）。

测试里给 `urlState={useMemoryUrlState()}` 就不需要 Next 路由。

### ZodForm

```tsx
<ZodForm
  schema={couponCreate.body}      // 契约的 body schema，就是唯一的校验来源
  fields={[...]}                  // 声明式字段表
  initialValues={record}
  columns={2}
  onSubmit={(values) => save.mutate({ body: values })}  // values 已经 parse 过
  submitting={save.isPending}
  error={save.error}              // 422 自动回填到字段，其它错误显示为横幅
/>
```

- 单字段规则来自 `schema.shape[name]`，所以字段永远不会和契约打架。
- `.refine()/.superRefine()` 这类跨字段规则在提交时整体 parse，再把 issue 回填到字段。
- 必填标记按"schema 是否接受 undefined"自动推断，`required` 可覆盖。
- 服务端 422 的 `details` 支持 zod `flatten()`、扁平 `{field: message}`、原始 issue 数组三种形状。

字段类型（`FieldSpec`）：

| kind                 | 值的形状              | 备注                                                             |
| -------------------- | --------------------- | ---------------------------------------------------------------- |
| `text` / `password`  | `string`              | `placeholder` `maxLength` `prefix` `addonAfter`                  |
| `textarea`           | `string`              | `rows` `maxLength` `showCount`                                   |
| `number`             | `number`              | `min` `max` `step` `precision`                                   |
| `money`              | `string` `"12.00"`    | `MoneyInput`，字符串进出，永不浮点                               |
| `switch`             | `boolean`             | `checkedText` `uncheckedText`                                    |
| `select`             | `string \| string[]`  | `options` `mode: 'multiple'\|'tags'`                             |
| `radio` / `checkbox` | `string` / `string[]` | `options`，radio 支持 `optionType: 'button'`                     |
| `date`               | ISO instant           | `showTime`                                                       |
| `dateRange`          | `[ISO, ISO]`          | `wholeDays`（默认把两端对齐到当天起止）                          |
| `treeSelect`         | `string \| string[]`  | `treeData` 或 `loadOptions` + `cacheKey`，`leafOnly`             |
| `cascader`           | `string[]`            | 省市区等，`options` 或 `loadOptions` + `cacheKey`                |
| `richText`           | HTML `string`         | Tiptap，懒加载；插图走 `AssetPicker`                             |
| `asset`              | `string` / `string[]` | `multiple` `max` `valueType: 'url'\|'id'\|'asset'`（默认 `url`） |
| `link`               | `{type,label,url}`    | `LinkPicker`                                                     |
| `sortableList`       | `T[]`                 | dnd-kit 拖拽排序，`newItem` `renderItem` `max` `min`             |
| `custom`             | 任意                  | `render({ value, onChange, disabled })`                          |
| `hidden`             | 任意                  | 只在值里，不渲染                                                 |

公共 props：`name` `label` `help` `tooltip` `required` `disabled` `span`（24 栅格） `visibleWhen(values)` `rules`（额外 antd 规则）。

### ModalForm / DrawerForm

弹窗表单。props 同 `ZodForm` 的 schema/fields/initialValues，外加 `route` `toInput` `invalidate` `successMessage` `onSuccess` `width` `columns`。提交中禁用、成功后自动关闭并失效列表。配 `useFormModal<T>()` 拿 `{ open, record, show(record?), close, props }`。

#### 编辑表单必须先把整条记录读回来

**列表行不是记录。** 列表路由只回列上看得见的字段，更新路由收的是整条记录：拿列表行当
`initialValues` 打开表单，列表没带的字段就按 schema 默认值提交回去——预售活动上这意味着
一份空的 规格 列表，和一次「我只改了标题」的保存删光了活动上所有预售价。

所以给 `useFormModal` 一个 `detail`，编辑对话框就会先读详情再渲染：

```tsx
const modal = useFormModal<PresaleActivityListItem, typeof presaleAdminActivityDetail>({
  detail: {
    route: presaleAdminActivityDetail,
    params: (row) => ({ id: row.id }),
    // 详情行 → 表单值；形状本来就一致时可以不写
    select: initialValuesOf,
  },
});

<ModalForm {...modal.props} route={modal.record ? update : create} … />;
```

`modal.props` 在编辑时带上 `load`，新建时不带——新建对话框照旧立刻打开，一个请求都不发。

三个状态由 kit 负责，页面不用管：详情在途时是骨架屏且**没有保存按钮**；失败时是错误原因
加一个「重试」；成功后字段才挂载，且挂载时值已经在里面。**永远不会出现填了一半的表单**，
也没有任何一个往已经渲染的表单里灌值的 `useEffect`——那正是出错的地方。

也可以直接写 `<ModalForm load={{ route, params, select? }}>`；`useFormModal({ detail })` 只是
替你把它接好。`select` 的返回类型是普通对象（控制器并不知道 body schema），所以页面上的
`initialValuesOf` 请自己写好返回类型标注——那是字段写错能被编译器抓住的地方。

### AssetPicker

素材库弹窗：左侧分类树、中间分页图片网格、拖拽/多选上传，返回契约的 `asset` 对象。

对着 `AssetSource` 接口编程，不直接调路由：

```ts
interface AssetSource {
  listCategories(): Promise<AssetCategory[]>;
  listAssets(q: { categoryId?; page; pageSize; keyword? }): Promise<AssetListResult>;
  upload(file: File, categoryId?): Promise<AssetItem>;
  remove(ids: string[]): Promise<void>;
}
```

没有默认来源：外面没有 `<AssetSourceProvider>` 时 `useAssetSource()` 直接抛错，免得选到素材库之外的文件存进真实数据。真实素材库由 `@/admin/storage` 的 `StorageAssetSourceProvider` 在 shell 布局里接上；测试用 `@/test/asset-source` 的 `createStubAssetSource()`，kit 演示页挂自己的内存来源。

另有 `useAssetPicker()` 返回 `{ pick(options): Promise<AssetItem[]>, holder }`，给富文本工具栏这类拿不到弹窗状态的地方用。

### LinkPicker

选商城内部链接：商城页面（按分组）/ 商品 / 分类 / 文章 / 自定义 URL，返回 `{ type, label, url }`。同样对着 `LinkSource` 接口编程，也没有默认来源：用到的页面（如 DIY 编辑器）用 `<LinkSourceProvider>` 挂上真实来源，测试用 `@/test/link-source` 的 `createStubLinkSource()`。表单里用 `kind: 'link'`。

### ConfigGroupForm

```tsx
<ConfigGroupForm
  descriptor={paymentGroup} // { group, title, description?, fields: [...] }
  values={data?.values}
  route={configSave}
  invalidate={[configGet]}
  successMessage="已保存"
/>
```

字段 `kind`：`text` `password` `number` `money` `switch` `select` `textarea` `asset` `json`；`visibleWhen: { key, equals }` 做条件显示（也接受函数，但 core 侧请用数据形式，方便 `defineConfigGroup` 直接发出来）。

**分节（`section`）**：字段带 `section` 时，表单按 section **首次出现的顺序**把可见字段分组，每组上面加一条左对齐的分隔标题。没有 `section` 的字段排在最前面，整组都没有 `section` 就和以前一模一样——一个 `<Row>`，没有分隔线。只有当前可见的字段参与分组，所以被 `visibleWhen` 隐藏光的小节不会留下一个空标题。

刻意不做 `<Tabs>`：配置表单是**一次提交**的，藏在别的标签页里的校验错误等于看不见。`trade` 有 11 个字段分四节、`storage` 12 个分两节、`site` 14 个——分节是让"退货地址"这种字段能被找到的唯一办法。

**密钥约定（重要）**：`password` 字段在 `values` 里的值是 **布尔** —— `true` 表示已设置、`false`/缺省表示未设置，**服务端永远不回传明文**。界面显示 `已设置 / 未设置` + 一个空输入框；留空 = 不修改，填了才会把新值放进保存的 payload 里。描述符类型在 `config/types.ts`，刻意保持最小，方便 P0-A 的 `defineConfigGroup` 直接产出兼容结构。

---

## 菜单与权限

- 每个域写 `src/admin/menu/<domain>.menu.ts`，默认导出 `defineMenu({ key, label, icon, path?, permission?, order, children? })`（也可以导出数组）。`pnpm gen` 聚合成 gitignore 的 `menu.gen.ts`，不用改任何共享索引，天然无冲突。
- `order`：域之间留 100 的间隔，域内留 10。
- `hidden: true` 的节点不进侧边栏，但参与面包屑（详情页、`…/new`、`…/:id/edit` 用它）。
- `icon` 是 `@ant-design/icons` 的导出名，需要新图标就在 `menu/icons.tsx` 加一行 import 和一行映射。
- `<Can permission="…">`、`useCan()`、`<RequirePermission>`、`requirePermission(atom, Page)`；`isSuper` 全放行。**前端权限只是体验，服务端仍然按路由声明的 permission 复查。**

## 通知

`useNotificationStream(url)` → `{ notifications, unreadCount, status, markRead, markAllRead, reconnect }`。SSE + 指数退避重连；连不上若干次就转为 `unavailable` 静默（Phase 0 接口还不存在）。事件形状 `{ id, type, title, body, link?, createdAt }`。
