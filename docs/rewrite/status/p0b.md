# P0-b — 后台壳与组件套件

分支 `rewrite/ws-p0b-shell`，工作树 `../CRMEB-wt/ws-p0b`。

## Done

- **应用骨架** `next/apps/web`：Next 16.3.5 App Router（Turbopack）、React 19.3、antd 6.6.5 + `@ant-design/nextjs-registry`（SSR 样式抽取）、zh_CN + dayjs zh-cn、主题 token 文件、亮/暗算法切换（localStorage 存储 + cookie 镜像供 SSR 首屏，无闪烁无 hydration 警告）、`output: 'standalone'`、`transpilePackages: ['@shop/contracts']`。
- **类型化客户端** `src/admin/api/`：`callRoute` / `useRouteQuery` / `useRouteMutation` / `useInvalidateRoutes`、`ApiError`、query key 由 `route.id` + input 推导、全局错误提示（cache 级 `onError`，单次可退出）、401 跳登录（可 `onUnauthorized: 'throw'` 关闭）、开发环境按契约校验响应。
- **登录与会话**：`/admin/login`（含滑块验证码插槽 `registerLoginCaptcha`）、`SessionProvider`、`useCan` / `<Can>` / `<RequirePermission>` / `requirePermission()`、退出登录。契约用本地桩 `src/admin/api/_p0-stubs/auth.contract.ts`，经 `src/admin/api/contracts.ts` 单点再导出。
- **菜单注册表**：`defineMenu`、`<domain>.menu.ts` + `scripts/gen-menu.ts` → 被 gitignore 的 `menu.gen.ts`、按权限过滤、空父节点自动消失、面包屑由菜单树推导。
- **外壳** `app/admin/(shell)/layout.tsx`：可折叠侧栏、面包屑（在 `PageContainer` 里）、通知铃铛（SSE + 退避重连，接口不存在时静默）、主题切换、用户菜单、内容区错误边界 + suspense、403/404、工作台占位页。响应式到平板宽度。
- **组件套件** `src/admin/kit/`：`CrudTable`（URL 同步的服务端分页/排序/筛选、列助手、工具栏、批量操作、刷新、空态）、`ZodForm` + 全套字段（含 `MoneyInput`、`TreeSelectField`、`CascaderField`、懒加载 Tiptap `RichTextField`、`AssetField`、dnd-kit `SortableListField`）、`ModalForm`/`DrawerForm`、`AssetPicker`（`AssetSource` 接口 + 内存桩）、`LinkPicker`（`LinkSource` 接口 + 内存桩）、`ConfigGroupForm`（描述符驱动，密钥只在改动时下发）、`PageContainer`、`StatusTag`、`MoneyText`、`InstantText`、`ConfirmButton`、`DescriptionsCard`。用法见 `src/admin/kit/README.md`。
- **演示页** `/admin/dev/kit`：对着真实 `defineRoute` 假路由 + 内存 fetch 跑通每个组件；菜单项 `devOnly`，生产构建不出现在菜单里。
- **测试**：8 个文件 / 103 条用例（见下）。

## 门禁输出（逐字）

```
$ cd next && corepack pnpm install
Scope: all 4 workspace projects
Already up to date
Done in 3ms using pnpm v12.5.1

$ corepack pnpm --filter @shop/web gen
$ tsx scripts/gen-menu.ts
gen-menu: 2 menu file(s) -> src/admin/menu/menu.gen.ts

$ corepack pnpm --filter @shop/web typecheck
$ tsc -p tsconfig.json

$ corepack pnpm --filter @shop/web lint
$ node scripts/eslint-ts6.mjs
eslint: 97 files, 0 errors, 0 warnings

$ corepack pnpm --filter @shop/web test:unit
$ vitest run

 RUN  v5.0.1 /home/xiangyu/Projects/CRMEB-wt/ws-p0b/next/apps/web

 Test Files  8 passed (8)
      Tests  103 passed (103)
   Duration  3.03s

$ corepack pnpm --filter @shop/web build
  Creating an optimized production build ...
✓ Compiled successfully in 246ms
  Collecting page data using 8 workers ...
✓ Generating static pages using 8 workers (7/7) in 455ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /admin
├ ƒ /admin/403
├ ƒ /admin/dev/kit
└ ƒ /admin/login

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

开发服务器冒烟（`next dev --port 3123`，服务端日志零警告零报错）：

```
▲ Next.js 16.3.5 (Turbopack)
- Local:         http://localhost:3123
✓ Ready in 186ms
✓ Running next.config.ts took 20ms

/admin/login   -> HTTP 200
/admin/dev/kit -> HTTP 200
/admin         -> HTTP 200
/admin/403     -> HTTP 200
/              -> HTTP 200

 GET /admin/login 200 in 588ms (next.js: 113ms, application-code: 475ms)
 GET /admin/dev/kit 200 in 225ms (next.js: 11ms, application-code: 214ms)
 GET /admin 200 in 43ms (next.js: 9ms, application-code: 34ms)
 GET /admin/403 200 in 46ms (next.js: 8ms, application-code: 38ms)
 GET / 200 in 47ms (next.js: 12ms, application-code: 35ms)
```

首轮跑出的唯一告警 `Warning: [antd: Spin] 'tip' is deprecated` 已修（改用 `description`），上面是修后的日志。

## 测试覆盖

| 文件 | 用例 | 覆盖 |
|---|---|---|
| `src/admin/api/call-route.test.ts` | 21 | URL/param/query 拼装、cookie 与 JSON body、错误映射、网络失败、401 处理与退出、响应校验、204、query key 推导、422 details 三种形状 |
| `src/admin/menu/tree.test.ts` | 17 | 权限过滤、空父节点消失、isSuper、排序、devOnly/hidden、面包屑最长前缀匹配、`defineMenu` 校验、`hasPermission` |
| `src/admin/session/can.test.tsx` | 9 | `<Can>`、fallback、数组"任一"、`<RequirePermission>`、`requirePermission()` |
| `src/admin/kit/money.test.ts` | 15 | 归一化/截断、fen 往返（含超 `MAX_SAFE_INTEGER`）、加法无浮点误差、格式化 |
| `src/admin/kit/form/money-input.test.tsx` | 10 | 输入过滤、半个小数点、失焦归一、清空、外部赋值 |
| `src/admin/kit/form/zod-form.test.tsx` | 9 | 必填推断、字段级 zod 消息、提交 parse 后的值、跨字段 refine、422 回填字段、非 422 横幅、`visibleWhen` |
| `src/admin/kit/table/crud-table.test.tsx` | 8 | 默认分页请求、从 URL 读 page/pageSize/sort、筛选写回并回到第一页、重置、`urlPrefix` 命名空间、排序转 `sortBy`/`sortOrder`、翻页、错误空态 |
| `src/admin/kit/config/config-group-form.test.tsx` | 14 | `buildConfigPayload` 密钥语义、`visibleWhen`、已设置/未设置展示、不回传未改密钥、只发改过的密钥、保存后清空、group 路径参数 |

Playwright 冒烟：**未做**。本机没有连接的浏览器，也没装 Playwright 浏览器包（几百 MB），装它会拖慢 Phase 0。`/admin/login` 与 `/admin/dev/kit` 的 SSR 已用 curl 验到 HTTP 200 且服务端无告警，但**浏览器控制台未实测**。TODO 给 K 流（后台 E2E）：登录页渲染 + 用 mock 的 `me` 渲染外壳，以及 kit 演示页各 tab 的控制台零报错。

## 需要调度者处理

1. **契约类型缺陷（已提 CR）**：`docs/rewrite/cr/CR-1-p0b.md` —— `exactOptionalPropertyTypes` 下 `ParamsOf`/`QueryOf`/`BodyOf` 对**所有**路由都求值为 `undefined`。客户端已用 `NonNullable` 自建等价类型绕过，不阻塞。
2. **合并时一行替换**：把 `apps/web/src/admin/api/contracts.ts` 里
   `from './_p0-stubs/auth.contract'` 改成 `from '@shop/contracts'`，删掉 `_p0-stubs/`。全仓库只有这一处引用。
3. **`pnpm-workspace.yaml`（调度者独占，本地改了但没提交）**：
   ```yaml
   allowBuilds:
     unrs-resolver: true        # eslint-import-resolver-typescript 的原生绑定，不批准则 install 失败
   minimumReleaseAgeExclude:    # pnpm 12 自动加的，@tanstack/react-query 5.103.2 太新
     - '@tanstack/query-core@5.103.2'
     - '@tanstack/react-query@5.103.2'
   ```
4. **`pnpm-lock.yaml` 未提交**（按简报要求），合并时重新生成。
5. **共享预设**：`packages/config` 还不存在，本地用了最小的 `eslint.config.mjs` 与 `vitest.config.ts`，合并时换成预设。换的时候请把下面两个 workaround 带过去。

## 判断与坑（后续各流必读）

- **ESLint 10 + TypeScript 7 目前是坏的**。`typescript-eslint@8.70`（`eslint-config-next@16.3.5` 依赖它）在 `require('typescript').versionMajorMinor >= 7` 时直接抛异常，官方建议"并排装 TS 6"。于是：
  - `scripts/eslint-ts6.mjs` 用 `Module._resolveFilename` 把 `typescript` 重定向到 `typescript-6`（`npm:typescript@6.0.3` 别名），只影响 lint 规则看到的 AST，`tsc` 仍是 7。
  - `eslint-plugin-react@7.37` 的 `detect` 分支调用 ESLint 10 已删除的 `context.getFilename()` → 配置里写死 `settings.react.version`。
  - `@typescript-eslint/scope-manager@8.70` 没有 ESLint 10 要求的 `scopeManager.addGlobals`，一旦某个配置块声明了 `globals` 就崩；`eslint-config-next` 只对 `.js/.mjs` 声明 globals，所以这些文件被 ignore（`.ts/.tsx` 正常 lint）。
  - typescript-eslint 支持 TS ≥ 7.1 后（issue #10940），删掉 shim、`typescript-6` 依赖和这两条 workaround。
- **`exactOptionalPropertyTypes` 很吵**。antd 的 `prop?: T`（没有 `| undefined`）不接受显式 `undefined`。kit 里所有自有组件的可选 props 都显式写成 `?: T | undefined`；要往 antd 组件传可能为 undefined 的值，用 `kit/props.ts` 的 `defined({ ... })` 展开。
- **vitest 5 用 oxc 转换**，而 Next 的 tsconfig 是 `jsx: preserve`，所以 `vitest.config.ts` 里必须显式 `oxc: { jsx: { runtime: 'automatic' } }`，否则 `.tsx` 测试解析失败。
- **antd 在两个汉字的按钮里插空格**（"保存" → "保 存"），`getByRole('button', { name: '保存' })` 会找不到。测试请用 `src/test/render.tsx` 的 `zhName('保存')`。
- **排序的 query 键约定是 `sortBy` + `sortOrder=asc|desc`**，各域的列表契约请按这个声明（`CrudTable` 的 `sortKeys` 可改，但别改）。多选筛选在 URL 里是 `a,b`，发出去是重复键 `?status=a&status=b`。
- **`/admin` 在面包屑解析里只做精确匹配**，否则工作台会成为每个页面的祖先。菜单里别再加 `path: '/admin'` 的第二个节点。
- **配置组的密钥语义**：`values` 里 `password` 字段的值是布尔"是否已设置"，明文永不下发、不回传。P0-A 的 `defineConfigGroup` 请产出兼容 `kit/config/types.ts` 的描述符。
- **`AssetSource` / `LinkSource` 现在是内存桩**。F1 接素材库、A/F2/G1 接链接源时，只要在外壳里包 `<AssetSourceProvider>` / `<LinkSourceProvider>`，kit 不用改。
- **登录页故意不用 `ZodForm`**：它必须在没有会话、没有外壳的情况下工作，且不是 CRUD 表单。
- **SSE 用裸 `EventSource`**，不走 `callRoute` —— 长连接没有契约 body，`RouteDef` 表达不了。这是唯一的例外。
- **`next-env.d.ts` 已加入 gitignore**：`next dev` 与 `next build` 写入的内容不同（`.next/dev/types` vs `.next/types`），提交只会产生噪音；没有它 `tsc` 也通过。
- **`agentRules: false`**：Next 16 的 `next dev` 会往包里写 `AGENTS.md` / `CLAUDE.md`，和 `docs/rewrite/` 的约定打架，已关闭。

## Not done / 已知缺口

- Playwright 冒烟（见上，留给 K 流）。
- `/admin/profile`（用户菜单里的"个人资料"）指向一个还不存在的页面 —— F1（`system`，管理员与角色）负责。
- 通知铃铛只在内存里记已读，刷新即丢。真正的已读状态等 E2 的通知接口。
- 工作台是占位，指标待 F2（`stats`）。
- `RichTextField` 只有基础工具栏（粗斜删、列表、链接、图片、撤销重做）。表格、代码块等按需再加。
- `AssetField` 的 `valueType: 'id'` 只能显示本次会话里刚选过的图的缩略图（服务端不回传 URL）。需要显示已有图片就用 `'url'` 或 `'asset'`。
