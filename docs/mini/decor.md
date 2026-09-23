# 页面装修 v2（`decor` 域）

计划第 2.1 节的后端部分，由 F1 流完成。v2 以 strangler 方式替代旧的 `diy` 域：旧域、旧接口、旧后台编辑器和 `apps/uni-app` 都保持不动，继续服务 uni-app；新小程序只读 v2。旧装修数据不迁移（pages.md 第 6 节）。

编辑器 UI（Puck）属于 F2 流（第 9 节），块组件属于 G 流。

## 1. 代码位置

| 层       | 位置                                                               | 内容                                                                  |
| -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 契约     | `packages/contracts/src/decor/`                                    | 文档模型、块注册表、`LinkTarget`、数据源、校验、错误码、路由契约      |
| 数据库   | `packages/db/src/schema/decor.ts`、`migrations/0004_decor.sql`     | `decor_documents`、`decor_revisions`                                  |
| 领域     | `packages/core/src/decor/`                                         | 文档服务、发布与回滚、指定页面、预览令牌、页面解析器                  |
| 后台接口 | `apps/web/app/admin-api/decor/**`                                  | 14 个路由，权限 `decor:page:read / write / publish`                   |
| 商城接口 | `apps/web/app/api/v1/pages/**`                                     | `home`、`user-center`、`:id`                                          |
| 后台页面 | `apps/web/app/admin/(shell)/decor/**`、`apps/web/src/admin/decor/` | 店铺装修（新版）：页面列表、编辑器、发布记录、预览、模板（第 9 节）   |
| 渲染     | `packages/storefront-blocks`                                       | 只从契约导入类型和无 zod 的常量；`src/schema/index.ts` 是对契约的转发 |
| 规则     | `docs/invariants.md` 的 DECOR-001 … DECOR-017                      | 每条规则都列出证明它的测试                                            |

**不含 zod 的模块**（小程序可以在运行时导入）：`constants.ts`、`link-route.ts`、`defaults.ts`、`meta.ts`、`rich-text.ts`。其余模块只能 `import type`。`decor.test.ts` 的「zod-free runtime modules」测试会检查这一点。

## 2. 文档模型

```ts
{
  schemaVersion: 2,
  root: { props: { title, background, shareEnabled, shareTitle, shareImage? } },
  blocks: [{ id, type, v, props }],
}
```

- **块**用 `defineBlock({ type, v, props, meta, migrate?, data?, personal? })` 声明，然后登记到 `all-blocks.ts` 的 `DECOR_BLOCK_DEFINITIONS`。目前有 14 种，见第 2.3 节。
- **基础属性**：每个块的 props 都必须用 `blockProps()` 构造，自动带上 `style`（间距、圆角、背景，只能取预设档位）和 `visibility`（`audience`: all / guest / member；`platforms`: 空数组表示所有客户端）。`defineBlock` 会拒绝不带这两项的 props。
- **版本和迁移**：`v` 是块 props 的版本号。`migrate[n]` 负责把 n 版升级到 n + 1 版，1 … v − 1 每一步都必须有，缺一步 `defineBlock` 在加载时就会报错。存储的数据在保存时迁移到当前版本；解析器在读取时也会迁移一次，所以旧修订不需要重写。
- **`meta`**：`label`、`pages`（哪些页面类型可以使用）、`maxPerPage`、`minClient`（能渲染该块的最低客户端版本，semver 格式）。
- **`data`**：由 props 推导出块需要的数据，按槽位命名，例如 `{ products: need.products(props.source) }`。块自己从不请求数据。
- **`personal`**：由 props 推导出块需要的**当前顾客自己的**数据（`personalNeed.orderCounts()`、`personalNeed.userSummary(stats)`），同样按槽位命名。它只是配置，随公共页一起缓存；数据本身只在个人层按请求计算（DECOR-015）。
- **编辑器元数据约定**写在 `meta.ts` 的文件注释里：标签必填；`.meta()` 可以加在包装链的任意一层；控件类型由 schema 推断；语义类型（`link`、`image`、`color` 和五种数据源）必须显式标出，因为服务端也靠这些标记在文档里找出链接和数据源。

### 2.1 `LinkTarget`

`product` / `category` / `article` / `page`（微页面 id）/ `route` / `webview` / `miniprogram`。

`route` 存的是 `{ route, params }`，由 R0 的路由目录（`system/storefront-routes.ts`）解析，只能选 `linkable` 的 key，参数严格校验。`linkTargetRoute()` 负责把链接转换成目录路由，不依赖 zod。后台的简易选择器目前只提供不带参数的 key（`ROUTE_LINK_LABELS`），带参数的 key 等 F2 流的 LinkPicker 实现。

### 2.2 数据源

数据源都按 `mode` 区分：

| 数据源           | 模式                          | 说明                                   |
| ---------------- | ----------------------------- | -------------------------------------- |
| `productSource`  | `manual`、`category`、`label` | 后两种模式带 `sort` 和 `limit`（≤ 20） |
| `couponSource`   | `manual`、`auto`              |                                        |
| `groupbuySource` | `manual`、`auto`              | 手动模式的 id 是活动 id                |
| `presaleSource`  | `manual`、`auto`              | 手动模式的 id 是活动 id                |
| `articleSource`  | `manual`、`category`          |                                        |

另外 `need.newUserCoupons(limit)` 返回新人券。

### 2.3 块一览

| 类型           | 名称        | v   | 页面                      | 数据 / 个人数据                 | 说明                                                                         |
| -------------- | ----------- | --- | ------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `searchBar`    | 搜索框      | 1   | home、custom（每页 1 个） |                                 | 点击打开搜索页，热词带 `keyword`；`sticky` 吸顶                              |
| `carousel`     | 轮播图      | 1   | 全部                      |                                 |                                                                              |
| `navGrid`      | 导航宫格    | 1   | 全部                      |                                 | 每行 4 或 5 个；`paging` 时按 `columns × rows` 分页横滑                      |
| `notice`       | 公告        | 1   | 全部                      |                                 | `scroll` 逐条上滚，间隔 ≥ 4 秒（design.md 动效规则）；`static` 全部列出      |
| `imageCube`    | 图片魔方    | 1   | 全部                      |                                 |                                                                              |
| `hotspotImage` | 热区图      | 1   | 全部                      |                                 | 热区按图片百分比存储，不得超出图片；编辑器在图上拖画                         |
| `titleBar`     | 标题栏      | 1   | 全部                      |                                 | 有 `moreLink` 时才显示「更多」                                               |
| `productGrid`  | 商品列表    | 2   | 全部                      | `products`                      | v2 加 `layout`（两列 / 三列 / 单列 / 横滑）；v1 迁移为 `grid2`，即原来的样子 |
| `productTabs`  | 商品选项卡  | 1   | home、custom              | `tab0` … `tab4`                 | 2–5 个选项卡，每个有自己的数据源；**全部随页面一起解析**，见下               |
| `richText`     | 富文本      | 1   | 全部                      |                                 | 白名单净化（DECOR-017），小程序用 `<rich-text>` 的节点数组渲染               |
| `spacer`       | 间隔/分割线 | 1   | 全部                      |                                 | 一个块，`line` 选无 / 实线 / 虚线                                            |
| `userCard`     | 用户卡片    | 1   | user_center               | 个人：`user`（`userSummary`）   | 游客显示「登录 / 注册」，点击发出 `login` 意图                               |
| `orderEntry`   | 订单入口    | 1   | user_center               | 个人：`counts`（`orderCounts`） | 角标：0 不显示，超过 99 显示 `99+`                                           |
| `serviceGrid`  | 服务宫格    | 1   | user_center               |                                 | 每项 `action` 为 `link` 或 `contact`（联系客服）；`link` 时必须选链接        |

- **商品选项卡为什么一次解析全部选项卡**：解析器只在整页响应里回答块的 `data`，没有按块取数的接口，所以块为每个选项卡声明一个槽位（`productTabSlot(i)`），切换选项卡是本地状态，无需网络。每个槽位受数据源自身的 `limit`（≤ 20）限制，最多 5 个。以后如果选项卡变重，需要新增一个公开的「解析单个数据源」接口，再改为懒加载。
- **意图**（`BlockIntent`）：块不直接调用平台能力。`contact` 和 `login` 通过 `onIntent` 交给宿主；联系客服在微信里必须是 `<button open-type="contact">`，宿主可以传 `renderIntent` 把该项包进自己的原生控件，这时块不再挂点击处理。
- **个人中心的角标**：`orderCounts` 取自订单域的 `order.counts`（`aftersale` = 退款中）。`unreviewed`（待评价）目前没有计数来源，所以不显示角标。

## 3. 校验：保存从宽，发布从严（DECOR-003）

`checkDocument(input, { kind })` 分两级检查：

1. **外壳**：`schemaVersion`、块数量（≤ 60）、字节数（≤ 256 KB）。不通过时拒绝保存，返回 `DECOR_DOCUMENT_INVALID`（422）。
2. **内容**：root props、每个块的 props、块 id 是否重复、页面类型是否允许该块、`maxPerPage`、需要数据的块数量（≤ 20）。有问题时照样保存（未通过的块按原样存储），问题连同路径写入 `issues` 返回。有 `issues` 的草稿**不能发布**。

- **未知块类型，或版本比当前构建新的块**：原样保存，同时产生一条 warning 和一条 issue（不能发布）。解析器会跳过这类块。
- **读取草稿**（`GET …/documents/:id`）返回的是校验后的文档：旧版本的块已经迁移、默认值已经补齐，所以块升级前保存的草稿在新编辑器里照样能打开，下次保存时按新版本存储。
- **富文本**（DECOR-017）：`richText` 的 `html` 由 schema 的 `.overwrite(sanitizeRichText)` 净化，保存时存的是净化后的字符串；解析器解析每个块时再净化一次，所以即使数据库里的行没有净化过，返回的也是干净的。白名单：常见文本标签（段落、标题、列表、引用、强调等）和 `https://` 或站内路径的 `img`；`script`、`style`、`iframe`、表单等连同内容一起丢弃，其他标签（包括 `a`）去掉标签保留文字；属性只保留过滤后的 `style`（颜色、背景色、对齐、粗细、斜体、下划线）和 `img` 的 `src` / `alt`。
- **未知或不可见的 id**（DECOR-004）：商品下架或删除、券不可领、文章未发布、活动不在时间窗内、微页面不存在，一律只产生 **warning**，不报错，也不阻止发布，解析器静默跳过。原因是记录的状态会在保存之后变化，发布时报错也挡不住下一分钟的下架。warning 由各域 `index.ts` 的公开读取接口判断（`decor.references.ts`）；某个检查本身失败时只记日志，不影响保存。

## 4. 数据表与修订

- `decor_documents`：`kind`（home / user_center / custom）、`name`、`title`、`draft`（jsonb）、`draft_version`（乐观锁）、`published_revision_id`、`published_draft_version`、`designation`（home / user_center / null）、软删除字段。
  - 部分唯一索引 `decor_documents_designation_uq` 保证每种指定最多一份文档。
  - CHECK 约束保证：被指定的文档与指定的类型一致、已发布、未删除。
  - 复合外键 `(id, published_revision_id)` → `decor_revisions(document_id, id)`，保证 live 指针只能指向本文档自己的修订。
- `decor_revisions`：`number` 按文档递增，另有 `content`、`note`、`restored_from`。表上的触发器拒绝一切 `UPDATE` 和 `DELETE`，所以修订只能追加（DECOR-006）。
- **保存草稿**：条件更新 `WHERE draft_version = :version`，冲突时返回 `DECOR_VERSION_CONFLICT`（409），`details.version` 是当前版本（DECOR-010）。
- **发布**：在一个事务里完成，先 `SELECT … FOR UPDATE` 锁住文档，再严格校验、写入新修订、移动 live 指针（DECOR-007）。
  - 如果当前草稿已经发布过，返回 `DECOR_NOTHING_TO_PUBLISH`，所以双击或两人同时发布只会产生一条修订。
  - 请求带 `version` 时，它必须等于当前草稿版本。
- **回滚**：把旧修订的内容作为**新修订**重新发布，并设置 `restored_from`；草稿不动（DECOR-011）。
- **指定首页或个人中心**：`PUT /admin-api/decor/designations/:designation`，请求体为 `{ documentId | null }`。操作在每种指定一把的 advisory lock 下执行，同时锁住目标文档（DECOR-008）。
- **删除**：软删除。正在被指定的文档不能删除，返回 `DECOR_DOCUMENT_IN_USE`（DECOR-009）。

## 5. 接口

后台接口（`auth: admin`；带「审计」标记的写操作都有审计记录，目标见下表）：

| 方法与路径                                                       | 权限    | 审计目标                           |
| ---------------------------------------------------------------- | ------- | ---------------------------------- |
| `GET /admin-api/decor/documents`                                 | read    |                                    |
| `POST /admin-api/decor/documents`                                | write   | `decor:document:<id>`              |
| `GET /admin-api/decor/documents/:id`                             | read    |                                    |
| `PATCH /admin-api/decor/documents/:id`（改名）                   | write   | `decor:document:<id>`              |
| `DELETE /admin-api/decor/documents/:id`（204）                   | write   | `decor:document:<id>`              |
| `POST /admin-api/decor/documents/:id/duplicate`                  | write   | `decor:document:<新 id>`           |
| `PUT /admin-api/decor/documents/:id/draft`                       | write   | `decor:document:<id>`              |
| `POST /admin-api/decor/documents/:id/publish`                    | publish | `decor:document:<id>:revision:<n>` |
| `GET /admin-api/decor/documents/:id/revisions`                   | read    |                                    |
| `GET /admin-api/decor/documents/:id/revisions/:number`           | read    |                                    |
| `POST /admin-api/decor/documents/:id/revisions/:number/rollback` | publish | `decor:document:<id>:revision:<n>` |
| `POST /admin-api/decor/documents/:id/preview-token`              | read    | `decor:document:<id>`              |
| `GET /admin-api/decor/designations`                              | read    |                                    |
| `PUT /admin-api/decor/designations/:designation`                 | publish | `decor:designation:<designation>`  |

商城接口（`auth: user-optional`）：`decor.pageHome`、`decor.pageUserCenter`、`decor.pageResolve`，分别对应 `GET /api/v1/pages/home`、`/user-center`、`/:id?previewToken=`。

pages.md 第 5 节里写的是建议的 id `diy.page*`，实际的 id 是 `decor.page*`。

## 6. 页面解析器

`resolveHome`、`resolveUserCenter`、`resolveDocument`（`decor-resolve.service.ts`）分三层：

1. **公共层，按修订缓存**（DECOR-013、DECOR-014）
   - 处理步骤：
     - 取 live 修订；
     - 逐块迁移到当前版本并解析；
     - 跳过未知类型、比当前构建新的版本、解析失败的 props；
     - 需要数据的块最多 20 个；
     - 以**匿名身份**并行解析每个槽位的数据。
   - 每种 need 对应一个解析器（`decor.resolvers.ts` 的 `defaultResolvers`），只通过对应域的 `index.ts` 读取数据，可见性按各域自己的规则判断：
     - 商品只取上架的。手动列表保持运营设定的顺序，售罄的商品保留并标 `soldOut`；分类或标签规则直接排除售罄商品。
     - 券只取可领的，文章只取已发布的，活动只取在时间窗内的。
   - 单个解析器失败时，该槽位返回 `null`，不影响整页。
   - 缓存键是 `decor:page:rev:<revisionId>`，TTL 为 `DECOR_CACHE_SECONDS`（60 秒）。
     - 每次请求都会查一次数据库，确定当前 live 的是哪条修订（一次索引读），所以发布或回滚后新修订立即生效。旧的缓存键同时删除。
     - TTL 设得短，是因为价格、库存这些数据不经过发布也会变化。
     - Redis 出问题时只会导致重新计算，不会让页面报错。
2. **请求层**（DECOR-016）：从同一份缓存页中按请求过滤块。
   - `visibility.audience` 对照是否登录；
   - `visibility.platforms` 对照 `X-Client-Platform`，未携带该头时不过滤；
   - 块类型的 `minClient` 对照 `X-Client-Version`，版本号不是 semver 格式时视为未知，不过滤。
3. **个人层，从不缓存**（DECOR-015）：只有请求带用户会话时才计算，结果放在 `personal[blockId][slot]`。内容有券的状态（`claimedCount`、`canClaim`），以及块用 `personal` 声明的数据：`orderCounts`（各状态订单数）和 `userSummary`（昵称、头像，`stats` 为真时加上可用券、收藏、足迹的总数）。同一请求里每种数据只取一次；某项取数失败只记日志，该槽位缺省，不影响整页。没有会话时，包括后台管理员身份，返回 `null`。

其他规则：

- **ETag**：对除 `resolvedAt` 以外的整个响应体做哈希，生成弱 ETag。页面没有变化时返回 304，发布后 ETag 随之变化。`version` 字段的取值：已发布页面为 `rev-<id>`，预览为 `draft-<id>-<n>`，内置个人中心为 `builtin-user-center-v2-2`（加入了「联系客服」）。
- **内置个人中心**（DECOR-005）：没有指定个人中心时，接口返回 `USER_CENTER_DEFAULT_DOCUMENT`，`id` 为 `null`，不会返回 404。新建的个人中心文档也从这份内容开始。
- **首页未设置**时返回 `DECOR_HOME_NOT_SET`（404）。

## 7. 预览令牌（DECOR-012）

`POST …/preview-token` 返回 `{ previewToken, expiresAt }`。

- 令牌是 256 位随机数，编码为 base64url。
- Redis 里只保存它的 SHA-256，键为 `decor:preview:<hash>`，值是文档 id，TTL 为 `PREVIEW_TOKEN_SECONDS`（10 分钟）。
- 令牌只能打开签发它的那份文档的**当前草稿**，结果不缓存，响应带 `preview: true`。

选择不透明令牌而不是签名令牌，是因为环境变量里没有可用于签名的密钥，而且 Redis 里的条目可以随时撤销。字段名用 `previewToken`，因为 `secrets` 守卫不允许响应里出现 `token` 字段。

## 8. 新增一个块

1. 在 `packages/contracts/src/decor/blocks/` 下用 `blockProps({...})` 和 `defineBlock` 声明块，并登记到 `all-blocks.ts`。
2. 需要数据时声明 `data`。如果是新的数据类型，需要依次加上：`DataNeed` 的一个成员、`ResolvedByKind` 的一个字段、`defaultResolvers` 的一个解析器、`collectReferences` 用到的 `ReferenceKind` 和 `decor.references.ts` 里的对应检查。
3. 修改已有块的 props 时要把 `v` 加一，并补上 `migrate[v-1]`。旧客户端无法渲染新块时，设置 `minClient`。
4. 在 G 流的 `packages/storefront-blocks` 里加组件，并登记到 `BLOCK_COMPONENTS`（它是覆盖全部类型的 `Record`，缺组件时编译不过）。组件只接收 props / data / personal，通过 `onLink`、`onIntent` 报告点击，不调用 Taro API，不请求数据；颜色用 design.md 的 CSS 变量（`shared/_tokens.scss`）。
5. 需要新的编辑控件时，在 `meta.ts` 的 `EditorFieldKind` 加一种，并在 `apps/web/src/admin/decor/` 的 `SEMANTIC_KINDS` 和 `DECOR_CUSTOM_FIELDS` 里登记。

## 9. 后台编辑器（F2）

菜单「店铺装修（新版）」（`decor.menu.ts`），与旧的 DIY 菜单并存。所有页面和按钮都按 `decor:page:read / write / publish` 控制，只有读权限时编辑器是只读的。

- **页面列表** `/admin/decor`：按类型筛选；「当前首页」「当前个人中心」卡片；每行显示线上版本和是否有未发布的修改；重命名、复制、删除（正在使用的页面不能删）；「设为首页 / 设为个人中心」要先确认，只对已发布且类型匹配的页面开放，确认框里写明会替换掉哪个页面。
- **新建页面**：选择类型、填写名称，可以从模板开始。模板是 `src/admin/decor/templates/` 里的代码，作为创建请求的 `document` 发出，数据库里不预置任何页面，所以不存在重复种子的问题。
- **编辑器** `/admin/decor/:id`：占满整个窗口的 Puck 画布，没有自动保存。
  - 「保存草稿」带上加载时拿到的 `draftVersion`（DECOR-010）。遇到冲突时可以选择「载入对方的版本」或「用我的覆盖」。
  - 「发布」可以填写发布说明；有未保存的修改时先保存再发布。
  - 服务端返回的 issues 和 warnings 显示在工具栏下方，点「定位」会选中出问题的块。
  - 有未保存的修改时，返回列表会要求确认，关闭窗口会触发 `beforeunload`。
- **发布记录**：查看某个版本（只读画布，可以载入到编辑器），回滚（要先确认，会生成新版本，草稿不变，DECOR-011）。
- **预览**：先保存草稿，再申请预览令牌（DECOR-012）。
  - 设置了环境变量 `DECOR_PREVIEW_URL`（可选，支持 `{id}`、`{previewToken}`、`{kind}` 占位符，值会做 URL 编码）时，在 iframe 里打开 Taro H5 的页面。
  - 没有设置时（生产环境）提示「请在小程序体验版中预览」，并给出可复制的路径 `packages/page/index?id=…&previewToken=…`。
  - e2e 栈把 `DECOR_PREVIEW_URL` 指向商城接口自己的读取结果。
- **控件**：由契约的 `.meta()` 推断，包括图片、颜色、间距档位、单选（选项不超过 4 个时用 Segmented，否则用 Select）、多选（`visibility.platforms`）、链接（覆盖所有 `LinkTarget` 类型）、富文本、热区（G1）以及五种数据源。
- **组件沙盒**：`/admin/dev/decor-spike` 保留为开发用的组件沙盒，只在开发环境可用。

## 10. 待定事项

- `minClient` 目前是按块类型设置的。如果某个 props 版本需要更高的客户端，目前只能改用新的块类型，没有按版本单独设置的办法。
- 拼团和预售活动的列表接口不支持按 id 过滤，手动模式会从一页 100 条活动里挑选，超出这 100 条的活动会被跳过。
- design.md 第 3.2 节要求把 `diyThemeTokens` 改为有类型的 schema。这项工作要改旧 `diy` 域的配置，不在本期 F1 的范围内，还没有做。
