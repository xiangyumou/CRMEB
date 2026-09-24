# 切换清单：从 uni-app 到新小程序

**这是计划，不是已经做了的事。** 本文列出切换那一次要删什么、这次不能删什么、公众平台上要办什么、出了问题怎样回退。
编写时（2026-09-24，`storefront/mini`）一行代码都没有删；每一项动手前都要重新核对路径。

依据：计划「后端接口调整 → 切换时删除」和第 10 节的决定（3：删店员接口；4：新小程序发布那次同时删旧 uni-app；
5：生产的 `/` 改成落地页；6：旧表下一次发布再删）、[pages.md](pages.md) 第 2.8、2.9、3.4、4 节、
[wechat-compliance.md](wechat-compliance.md)、[H2 的状态记录](status/H2-backend.md)。

**需要你单独批准的动作**：合并到 `master`、push、部署到生产（`deploy/upgrade.sh`）、上传小程序代码、提交审核、发布。
下面每一处出现这些动作的地方都要先得到批准。

---

## 0. 开始前必须成立的条件

- [ ] [e2e-coverage.md](e2e-coverage.md) 第 4 节列出的缺口，每一项都已补上，或者你明确接受它（例如：密码登录不做）。
- [ ] `coupons.spec.ts` 里的 `test.fail`（预售叠加优惠券时订单页价格不对）已经修复，`test.fail` 那一行已删。
- [ ] 真机清单（[device-check.md](device-check.md) 第 6 节）有人跑过，结果已回报；隐私弹窗（D03）必须在真机上过。
- [ ] `storefront/mini` 上完整清单全绿（[contributing.md](../contributing.md) 的合并清单，加上 `test:mini`）。
- [ ] 部署演练 `deploy/rehearsal/drill.sh` 通过。
- [ ] 第 3 节的公众平台事项已办到「审核通过」这一步。

## 1. 建议的发布顺序（与计划不同的地方，请你决定）

计划是「切换那一次合并、删除、发布」。但微信审核的是**连着生产后端**的小程序版本，审核前生产上就必须已有
新小程序要调用的接口（`app/config`、`pages`、`share/mini-codes`、发货信息管理、内容安全……）。所以建议分三次发布：

| 发布              | 内容                                                                                                | 生产 `/`        |
| ----------------- | --------------------------------------------------------------------------------------------------- | --------------- |
| **A：新后端上线** | `storefront/mini` 合入 `master`（**不删任何东西**），部署。上传体验版，对着生产真机检查，提交审核。 | 仍是 uni-app H5 |
| **B：切换**       | 审核通过、发布小程序之后：第 2 节的删除，部署。                                                     | 落地页          |
| **C：删表**       | 下一次发布：按 OPS-007 删第 2.11 节的旧表。                                                         | 落地页          |

发布 A 只新增（迁移都是增量），可以用 `deploy/rollback.sh --last-upgrade` 回到当前的线上版本。
若坚持一次完成，则审核期间生产后端必须是删除之后的版本，而旧 H5 同时下线，回退代价更大。

## 2. 切换时删除（发布 B）

每一小节一个提交，删完跑一次 `pnpm guards`：它会指出遗漏的引用（契约与路由对不上、权限原子没人用、
规则目录引用的测试不存在）。

### 2.1 uni-app

- [ ] `apps/uni-app/` 整个目录。
- [ ] `pnpm-workspace.yaml` 里的 `'!apps/uni-app'` 和它上面的注释。
- [ ] `README.md`：技术栈表里的 `apps/uni-app` 行、目录树里的 `uni-app/`、「`apps/uni-app` is an npm project…」一节、
      清单里的 `(cd apps/uni-app && npm test && npm run build:h5)`。
- [ ] `docs/contributing.md`：`apps/uni-app/**` 的检查项、「the uni-app's `npm test`」、第 98 行附近「在 `apps/uni-app/api/`
      加调用和 mapper」的步骤、`pnpm guards` 说明里的「the uni-app resolves every call and page」。
- [ ] `docs/architecture.md`、`docs/conventions.md` 中标为 legacy 的 uni-app 小节，以及 Processes、Edge 表里的「uni-app H5」。

### 2.2 旧 uni-app 的 e2e

- [ ] `e2e/storefront/specs/`（10 个 spec），`src/uni.ts`、`src/known-gaps.ts`，`src/h5.ts` 和 `src/stack-file.ts` 中
      `uniapp` 的分支（`SHOP_E2E_CLIENT` 只剩 `mini`，或者去掉这个开关）。
- [ ] `playwright.config.ts`：去掉 `mobile-chromium` 项目，`testDir` 固定为 `./specs-mini`；`package.json` 的 `test`
      改为跑小程序（`test:mini` 并入 `test`）。
- [ ] `docs/invariants.md`：SMOKE-002…005 删去 `e2e/storefront/specs/` 的引用，陈述只写小程序；其他只引用旧 spec 的行
      （用 `grep -n "e2e/storefront/specs/" docs/invariants.md` 找）改引小程序的测试。
- [ ] [e2e-coverage.md](e2e-coverage.md) 标注「旧套件已删除」，第 1 节作为历史保留或删去。

### 2.3 旧装修（`diy` 域）和旧后台编辑器

- [x] **先搬走被新编辑器复用的代码**（已完成，H5-backend）：选择器数据源已在 `apps/web/src/admin/decor/`
      （`record-types.ts`、`catalog-records.ts`、`record-kinds.ts`，测试随之搬来），`records.tsx` 不再引用 `admin/diy`；
      ESLint 的 `no-restricted-imports`（`eslint.config.mjs` 的 `NO_LEGACY_DIY`）禁止 `src/admin/decor/**` 与
      `app/admin/(shell)/decor/**` 引用 `diy`。旧目录里剩下的只是转接：`diy/data-source.tsx` 的 `DiyPicker*` 类型是 decor
      类型的别名，`diy/record-source.ts` 把旧的 `labels`、`combination` 映射到 decor 的实现，`diy/catalog-source.ts` 转导出
      选择器函数、自留旧 uni 路径的 `catalogLinkTargets`。整个目录可直接删除，decor 不受影响。
- [ ] 后台：`apps/web/app/admin/(shell)/diy/`、`apps/web/src/admin/diy/`（含上面的转接文件及其测试）、只供旧面板测试用的
      `apps/web/src/test/diy-data-source.ts`、菜单 `apps/web/src/admin/menu/diy.menu.ts`、`diy:*` 权限原子（`permissions`
      守卫会提示没人用的原子）。`NO_LEGACY_DIY` 规则删不删都可以（目录没了就不会再命中）。删完跑一遍
      `grep -rn "admin/diy\|/diy/" apps/web/src apps/web/app` 确认无残留引用。
- [ ] 接口：`apps/web/app/api/v1/diy/**`（`diy.layout`、`diy.navigation`、`diy.pageVersion`、`diy.theme`、`diy.homePage`、
      `diy.userCenterPage`、`diy.productDetailPage`、`diy.page`）、`apps/web/app/admin-api/diy/**`（页面、主题、链接库）。
- [ ] 契约 `packages/contracts/src/diy/`（含 `removed.ts` 的 `REMOVED_STOREFRONT_PAGES`、默认 JSON、`__fixtures__`），
      领域 `packages/core/src/diy/`（`pnpm gen` 重新生成 `domains.gen.ts`）。
- [ ] `e2e/admin/specs/diy.spec.ts`。
- [ ] `docs/invariants.md` 的 DIY-001…009 行（逐条确认只关于旧装修；编号不再复用），以及 RISK-D-008、RISK-D-009
      中引用旧装修测试的行；`docs/architecture.md` Domains 表的 `diy` 一行。

### 2.4 只为旧前端存在的辅助接口

| 路由 id                                           | 方法与路径                               |
| ------------------------------------------------- | ---------------------------------------- |
| `catalog.categoryVersion`                         | `GET /api/v1/catalog/categories/version` |
| `catalog.skuPrice`                                | `GET /api/v1/catalog/skus/:skuCode`      |
| `cart.decrementItem`                              | `POST /api/v1/cart/items/decrements`     |
| `system.attachmentDataUrl`                        | `POST /api/v1/attachments/base64`        |
| `diy.layout`、`diy.navigation`、`diy.pageVersion` | 随 2.3 一起删                            |

- [ ] 删契约、路由文件、只为它们存在的 service 函数和测试。
- [ ] **确认后再删** `system.siteConfigGet`（`GET /api/v1/site/config`，已由 `app/config` 取代）：先确认公众号 H5 页面和
      后台都不再读它；SYS-020 的陈述里提到它，要一起改。

### 2.5 店员接口（计划第 10 节第 3 项：你已同意）

- [ ] `apps/web/app/api/v1/staff/**`（32 个路由文件，共 36 个接口），契约 `order/order.staff.contract.ts`、
      `user/user.staff.contract.ts`、`catalog/catalog.staff.*`、`shipping` 的 `staffExpressCompanies` 等。
- [ ] `StaffCheck`（`packages/core/src/auth/user-lookup.ts`）和只被店员接口调用的 service（`order.staff.service.ts`、
      `user-staff.service.ts`）。**后台也在用的 service 保留**：删之前对每个导出 `grep` 一遍调用方。
- [ ] `order.fulfil.config.ts`、`storage.service.ts` 中与店员相关的分支；`audit_logs.actor_kind = 'staff'` 的约束和已有数据保留。

### 2.6 写死的旧小程序路径和旧小程序码接口

- [ ] `MINI_CODE_PAGES` 和 `miniCodePage`（`packages/contracts/src/wechat/schemas.ts`）。
- [ ] `wechat.miniCode`：`GET /api/v1/wechat/mini-qrcodes`（`wechat.storefront.contract.ts`、
      `apps/web/app/api/v1/wechat/mini-qrcodes/route.ts`），以及 `system.attachment.contract.ts`、`wechat.share.contract.ts` 注释中的引用。
      `wechat_mini_codes` 缓存表保留（新接口 `share/mini-codes` 也用它）。
- [ ] `packages/core/src/diy/link.service.ts`、`page_links` 的读取随 2.3 删除；[pages.md](pages.md) 第 4.2、4.3 节列出的
      默认数据和契约示例里的旧路径一并清掉。

### 2.7 通知的旧 `link` 和 `wechatMini.page`

- [ ] 事件定义里的 `link`（`packages/core/src/notification/notification.registry.ts`、`groupbuy.notifications.ts`、
      `presale.notifications.ts`），只留 `route`。
- [ ] `wechatMiniChannelConfig.page`（`packages/contracts/src/notification/schemas.ts`），后台
      `notification-templates.tsx` 中 `['channels', 'wechatMini', 'page']` 字段，`notification.send.ts` 中 `subscribePage` 的旧值回退。
      已保存的配置里多出的 `page` 键在读取时忽略即可，不必迁移。
- [ ] **需要你决定**：公众号模板消息现在用 `link` 拼出 H5 地址（`sendWechatOa`）。H5 下线后这些链接只会打开落地页。
      可选：(a) 改为模板消息的 `miniprogram: { appid, pagepath }`，`pagepath` 用 `toMiniPath(route)`；(b) 不带链接；
      (c) 停用公众号模板消息渠道。建议 (a)，这是一处代码改动，要在发布 B 之前做完并测试。

### 2.8 守卫

- [ ] `uniapp` 检查：`guards/src/checks/uniapp.ts`、`guards/src/lib/uniapp.ts`（及测试）、`guards/src/cli.ts` 中的注册、
      `guards/src/lib/paths.ts` 的 `uniApp`。
- [ ] `retired` 检查：`ALLOWED` 中的 `apps/uni-app/api/mappers/` 和 `apps/uni-app/api/README.md`，检查名称和 RISK 行陈述里的
      「the uni-app API layer」。
- [ ] `mini` 检查中为过渡期保留的允许列表（如仍有）清空。

### 2.9 CI（`.github/workflows/ci.yml`）

- [ ] 文件头注释里的「the uni-app storefront」。
- [ ] `storefront-e2e` 任务（uni-app 的 `npm ci`、`uni-app unit tests`、`test`）删除；`storefront-e2e-mini` 改名为
      `storefront-e2e`，跑合并后的 `test`。
- [ ] 镜像任务的「Build the H5 storefront」「Resolve the H5 bundle」两步删除：落地页由 `web` 回答（见 2.10），
      edge 镜像不再带任何前端产物；edge 步骤的 `build-args: H5_DIST=…` 和「the storefront from `apps/uni-app/`」注释一并删除。
- [ ] `REL-*` 规则和 `pipeline` 守卫若提到这两步，同步修改（改完跑 `pnpm guards`）。

### 2.10 edge：`/` 改为落地页

落地页已经写好（R1）：`apps/web/app/page.tsx`，由 `web` 容器回答，**还没有接到 edge 上**——在切换之前，edge 的 `/`
仍是 uni-app H5，落地页只在直接访问 `web:3000/` 时看得到。它显示店名（「站点设置 → 商城名称」）、首页的小程序码和
「请使用微信扫码打开」；小程序未启用或 AppID、AppSecret 没填时，显示「请在微信中搜索「<小程序名称>」小程序」的文字；
页脚是「站点设置 → 备案」里填了的 ICP 备案号和公安备案号。小程序码走 `shareMiniCodeUrl`（与分享海报同一个缓存表），
结果在 Redis 缓存一天；微信拒绝时显示文字并暂停十分钟再试，匿名访问最多每十分钟触发一次微信调用
（`apps/web/src/server/landing.ts`）。所以原计划里「从公众平台下载小程序码放进静态目录」不再需要。

- [ ] **发布前确认**：生产上后台「小程序设置」已启用、AppID 和 AppSecret 已填、「小程序码打开的版本」是「正式版」；
      直接请求 `web` 的 `/`（`docker compose exec edge wget -qO- http://web:3000/`）能看到小程序码的 `<img>`。
      小程序码只在正式版发布之后才扫得开（3.3）。
- [ ] `docker/edge/nginx.conf`，一处不多一处不少：

  ```diff
   # The `edge` server block: static H5, the shared uploads volume, and a proxy to
   # the Next standalone server.
   #
   # Three surfaces behind one port:
  -#   /                the uni-app H5 build, a history-mode SPA
  +#   /                the landing page, answered by `web` (apps/web/app/page.tsx)
   #   /admin, /admin-api, /api, /scan-upload    the `web` container
   #   /uploads/        the shared volume, as inert bytes
  @@ server {
       listen 80;
       server_name _;
  -    root /srv/h5;
  -    index index.html;
       charset utf-8;
  @@
  -    # Every Next route needs its prefix here, or a location of its own: a
  -    # path nothing above matches falls through to the storefront's
  -    # history-mode fallback and is answered with its `index.html`, not a 404.
  +    # Every Next route needs its prefix here, or a location of its own: a
  +    # path nothing above matches is redirected to the landing page at `/`,
  +    # not a 404.
  @@
  -    # --- the H5 storefront --------------------------------------------------
  -
  -    location = /index.html {
  -        add_header Cache-Control "no-cache, must-revalidate" always;
  -        add_header X-Content-Type-Options nosniff always;
  -    }
  -
  -    location ~* "\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|svg|jpe?g|png|webp)$" {
  -        try_files $uri =404;
  -        expires 1y;
  -        add_header Cache-Control "public, immutable";
  -        add_header X-Content-Type-Options nosniff always;
  -        access_log off;
  -    }
  +    # --- the landing page ---------------------------------------------------
  +
  +    # `/` is the web app's landing page: the shop's name and the 小程序码.
  +    location = / {
  +        proxy_pass http://web;
  +        proxy_http_version 1.1;
  +        proxy_set_header Host $host;
  +        proxy_set_header X-Real-IP $remote_addr;
  +        proxy_set_header X-Forwarded-For $remote_addr;
  +        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
  +        proxy_set_header Connection "";
  +        proxy_connect_timeout 5s;
  +        proxy_read_timeout 30s;
  +    }

       location ~ /\. {
           deny all;
           access_log off;
           log_not_found off;
       }

  -    # History-mode fallback, last so every rule above wins over it.
  -    location / {
  -        try_files $uri $uri/ /index.html;
  -        add_header X-Content-Type-Options nosniff always;
  -    }
  +    # Anything else — an old H5 link, an old share link — goes to the landing
  +    # page. Last, so every rule above wins over it.
  +    location / {
  +        return 302 /;
  +    }
   }
  ```

  `location = /` 是精确匹配，所以 `/api/…`、`/admin/…` 等前缀规则不受影响。它不写 `add_header`，好继承 server 级的
  `nosniff`、`X-Frame-Options`、`Referrer-Policy`（写了任何一条 `add_header` 就要把这三条重抄一遍）；缓存头由 Next 给
  （页面是 `force-dynamic`）。落地页不需要别的静态文件：样式内联，Next 的运行时在已经代理的 `/_next/static/` 下，
  小程序码图片在 `/uploads/` 下。

- [ ] `docker/edge/Dockerfile`：删除 `ARG H5_DIST=docker/edge/h5-placeholder`、`FROM` 下面的 `ARG H5_DIST`、
      `COPY ${H5_DIST}/ /srv/h5/` 和文件头关于 H5 的说明（镜像只剩 nginx 配置）；删除 `docker/edge/h5-placeholder/`；
      `Dockerfile.dockerignore` 删去 `!apps/uni-app/dist` 和关于 uni-app 的注释。
- [ ] `deploy/rehearsal/drill.sh` 的 `case_edge_proxies_every_page`（第 722 行起）：「没有被代理」的判据从「回答等于
      storefront 的 `index.html`」改为「回答是 302、`Location` 为 `/`」；去掉跳过 `/` 的那一行
      （`[ "$url" != '/' ] || continue`）和「`/` is the storefront's on purpose」的注释——`/` 现在也必须由 `web` 回答；
      开头取 `index.html` 的那段删除。`deploy/README.md` 相应段落。（`deploy/` 由切换那次的提交改，R1 没有动。）
- [ ] `e2e/storefront` 不受影响（它用自己的 Node 版 edge，`src/edge.ts`，根目录是小程序的模拟构建）。

### 2.11 这次**不删**的东西

- **数据库表**：`diy_pages`、`themes`、`page_link_categories`、`page_links`，以及店员相关数据。回退要求上一版镜像能在
  新 schema 上运行，所以本次不 DROP；发布 C 按 OPS-007 删除，每条破坏性语句标注 `-- destructive: approved`，
  并更新 `migrations` 守卫的 `EXPECTED_MIGRATIONS`。
- **公众号和 H5 专用接口**（计划「保留不动」）：`auth.oaAuthorizeUrl`、`auth.oaLogin`、`auth.oaPhoneLogin`
  （小程序的短信登录也用它）、`wechatOa.jssdkConfig`、`wechatOa.subscribeTemplates`、`wechat_h5` 支付通道、公众号后台功能。
- `auth.sendSmsCode`、`auth.smsLogin`、密码登录接口：后端保留，小程序只用短信登录的那一部分。
- `wechat_mini_codes` 表、`content_security_checks`、`wechat_trade_orders` 等新表。

---

## 3. 微信公众平台和其他平台上的事项（运营或老板办理）

完整说明和依赖顺序见 [wechat-compliance.md「需要运营或老板办理的事项」](wechat-compliance.md#需要运营或老板办理的事项)。
这里按切换时间线重排，勾选时注明日期。

### 3.1 发布 A 之前（关键路径，越早越好）

- [ ] 1 营业执照、法人、对公账户；确认商品需要的前置资质。
- [ ] 2 域名 ICP 备案（最长、最不可控）。
- [ ] 3 企业主体注册小程序，AppID 和 AppSecret 交给技术填入后台「小程序设置」。
- [ ] 4 微信认证（C01）。
- [ ] 5 服务类目和资质（C02）。
- [ ] 6 小程序备案（C03）。
- [ ] 7 微信支付商户号：开通 JSAPI、关联小程序 AppID、APIv3 密钥和证书（C06）。
- [ ] 8 用户隐私保护指引，按 C04 的表填写。
- [ ] 9 申请 `wx.chooseAddress` 接口权限（C04）。
- [ ] 13 手机号快速验证资源包和余额提醒（C05）。
- [ ] 14 绑定客服人员（C15）。
- [ ] 15 阿里云短信签名和模板（C05）。
- [ ] 16 代码上传密钥和 IP 白名单；真机测试人员加为体验成员。
- [ ] 17 基础库最低版本设为 3.0.0（C14）。

### 3.2 发布 A 部署之后

- [ ] 10 服务器域名（request、uploadFile、downloadFile）和业务域名（web-view），放校验文件（C03、C12）；
      后台「小程序设置」的业务域名列表与公众平台一致（CLIENT-002）。
- [ ] 11 消息推送：URL `https://<域名>/api/v1/webhooks/wechat-mini`，Token 和 EncodingAESKey，**数据格式 JSON、安全模式**；
      同样的值填入后台「小程序设置」（C07、C09）。
- [ ] 12 订阅消息模板：按 C08 的场景表选模板，模板 ID 填入后台（C08）。
- [ ] 18 后台「快递公司」逐个填写微信快递编码（C07）；「系统设置 → 小程序发货信息管理」打开「录入发货信息」并点一次「同步」。
- [ ] 后台「内容安全」开关打开；安排人每天处理评价管理中的「待审核」（CONTENT-001）。
- [ ] 后台「店铺装修（新版）」发布首页和个人中心（旧装修数据不迁移，用预置模板）；确认模板里「隐私包装」一类的文案属实。
- [ ] 19 审核准备：测试账号、清理测试数据、审核备注（C16）。
- [ ] 上传体验版（需要你批准），对着生产按 device-check 第 6 节做一遍真机检查。
- [ ] 20 提交审核；通过后**发布**。发布后确认已纳入发货管理（`is_trade_managed`），用 0.01 元商品走一次真实的支付、
      发货、确认收货和结算（C06、C07）。
- [ ] 发布当天：刷新接口兼容基线并打开开关（第 5 节）。

### 3.3 发布 B 前后

- [ ] 小程序正式版已发布之后，才对外发小程序码、海报（未发布版本的码扫不开）。
- [ ] 公众号菜单：把指向 H5 的 `view` 按钮改为 `miniprogram` 类型（在后台公众号菜单里选路由，C11）。
- [ ] 公众号模板消息按 2.7 的决定配置。
- [ ] 已印刷或已分享出去的旧 H5 链接会落到落地页；如有线下物料，按需重印小程序码。

---

## 4. 回退方案

### 4.1 后端和 edge

- **发布 B（切换）出问题**：`deploy/rollback.sh --last-upgrade` 回到发布 A 的三个镜像。旧 uni-app H5、旧装修接口、店员接口都回来；
  因为本次没有删表、迁移都是增量，上一版镜像可以直接跑在当前 schema 上，**不需要** `--restore`。已发布的小程序不受影响
  （它不调用被删的接口）。
- **发布 A 出问题**：同样 `--last-upgrade` 回到当前线上版本。注意：小程序一旦发布，后端就不能再回到发布 A 之前，
  否则小程序调用的接口会消失；这时只能修复后前进。
- **数据问题**：升级前的备份在 `data/backups/pre-upgrade-<时间>.sql.gz`；只有在明确需要恢复数据时才用
  `rollback.sh --last-upgrade --restore <文件>`（会丢失升级后写入的数据）。
- 回退后按 `deploy/README.md` 的 readiness gate 确认 `readyz` 通过。

### 4.2 小程序

- 公众平台「版本管理」可以把线上版本回退到**上一个线上版本**（以平台当时的规则为准）。第一次发布没有上一版可退：
  问题严重时用加急审核发修复版，必要时在后台关掉相关功能开关（例如「录入发货信息」、分享海报）。
- 后端回退到发布 A 时，新小程序照常可用；回退到发布 A 之前不可行（见 4.1）。

### 4.3 回退后要做的

- [ ] 记录原因和时间点；如果回退的是发布 B，公众号菜单和模板消息的链接改回 H5（若已按 3.3 改过）。
- [ ] 修复后重新走第 0 节的条件，再做一次发布 B。

---

## 5. 商城接口兼容守卫（`api-compat`）

小程序一旦发布，旧版本会在用户手机上留很久（微信择机更新，不重启就一直是旧版）。所以从第一个版本发布起，
`/api/v1/**` 只能增加，不能删除或收窄。R1 加了这个守卫，说明见 [guards/README.md](../../guards/README.md#the-api-compat-check)。

- **比较什么**：`pnpm gen` 生成的 OpenAPI 里 `/api/v1/**` 那部分，与 `guards/baselines/storefront-api.json`（上一个已发布
  版本看到的接口）比较。删除路径或方法、响应字段被删除或变为可选或可为 null、响应枚举值被删除、请求字段变为必填或被收窄，
  都算破坏；新增的一律通过。
- **开关**：`guards/src/checks/api-compat.ts` 顶部的 `export const ENFORCED = false`。`false` 时破坏性改动只作为
  note 打印（`[breaking, report-only]`），`pnpm guards` 仍通过；`true` 时让 `pnpm guards` 失败。开关打开而基线还是
  未发布的快照（`"release": null`）时，守卫本身报错。
- **刷新命令**，只在小程序发布时运行：

  ```sh
  pnpm --filter @shop/guards api-compat:refresh --release <版本号>   # apps/mini/package.json 的 version
  pnpm --filter @shop/guards api-compat:refresh --unreleased        # 仅限第一次发布之前
  ```

  它先重新生成 OpenAPI，再打印新基线「原谅」了哪些破坏性改动（写进提交说明），最后重写基线文件。基线记录了发布版本号之后，
  `--unreleased` 会被拒绝。基线是生成的文件，不手改。

### 5.1 什么时候做什么

- [ ] **第一次发布之前**：守卫只报告。各分支改了 `/api/v1` 合并后，用 `--unreleased` 重新生成基线并提交。
- [ ] **第一个小程序版本发布的当天**（3.2 第 20 项之后），在生产所运行的那个提交上：
      `api-compat:refresh --release <版本号>`，同一个提交里把 `ENFORCED` 改成 `true`，跑一遍 `pnpm guards`。
      此时基线里还有旧前端的接口（店员、旧装修、2.4 节那些），它们照样受保护，直到发布 B。
- [ ] **发布 B（切换）的删除提交**：2.3–2.6 节的删除会被守卫报为破坏。删完之后用**同一个已发布版本号**再跑一次
      `api-compat:refresh --release <版本号>`，核对它打印出的「原谅」清单只包含 2.3–2.6 节列出的接口（没有一条是
      新小程序调用的），清单写进提交说明。这是「只在发布时刷新」的唯一例外。
- [ ] **之后每次发布小程序**：`api-compat:refresh --release <新版本号>`，清单应该为空；不为空说明有破坏性改动混了进来，
      要么改回去，要么确认旧版本已不再使用（微信后台「版本管理」里旧版本的使用占比）后再接受。
