# K — 硬化（第一遍 / K1）

分支 `rewrite/ws-k-hardening`，工作树 `../CRMEB-wt/ws-k`。起点 `bdcf104a9`（E1 合并**之前**的 `rewrite/integration`），收尾前已 rebase 到 `612d0a000`（D、E1、E2、F1、F2、G1-G3、H、J、S 均已合并）。下面所有数字都是 rebase 之后重跑出来的。

两条命令，都从 `next/` 跑：

```sh
pnpm guards                          # 十项静态检查
pnpm --filter @shop/e2e-admin e2e    # 后台端到端（首次前先 playwright install chromium）
```

## Done

### 1. 守卫 `next/guards`（`pnpm guards`）

K-hardening §1 的十项静态检查，作为 pnpm workspace 包 + turbo 任务（`guards` 任务依赖 `gen`，两者 P0-A 已预留）。rebase 后当前输出：

```
ok   domains        19 declared domains, 19 imported by name
ok   contracts      397 contracts against 293 route files (379 exported handlers)
ok   route-hygiene  293 route files checked for force-dynamic; 133 admin write URLs checked for an audit target (26 exempt)
ok   permissions    106 declared atoms; 106 of them used by 258 admin routes and 44 menu entries
ok   admin-client   278 admin UI files checked for hand-built API URLs and raw fetch (1 documented exception)
ok   uniapp         185 calls: 148 live, 37 pending
ok   retired        26 retired features looked for in 1122 source files and 397 route paths
ok   banned         4 construct bans plus the fetch rule over 1135 files; the core clock lint rule asserted from @shop/config/eslint
ok   secrets        16 secret fields in 20 groups against 8465 response schema nodes in 397 contracts
ok   invariants     131 legacy cases and 78 risk-matrix entries against 273 ledger rows (478 test ids resolved)

10 checks, 0 failure(s), 164 pending on D2, E3, F2, F3, H2, I, J2, K, N1
```

三级结论：`fail`（现在就坏了，退出码 1）、`pending`（未合并流的活，打印所属流，不致命）、`note`。`pending` 正是让守卫能在重写**进行中**跑起来的东西；第二遍把 `pending` 变成致命，命令本身不用改。

七份豁免清单全部**精确比对**、只能变小：`route-hygiene` 的 `AUDIT_EXEMPT`、`admin-client` 的 `HAND_BUILT`、`retired` 的 `ALLOWED` / `DENY_LISTS`、`banned` 的 `FETCH_ALLOW`、`lib/marker-reassignments.ts`、`lib/pending-edits.ts`、`lib/pending-implementations.ts`（新增）。条目一旦不再命中就报错，要求删除。

rebase 带来的三处结构性改动，值得单独说：

- **`lib/pending-implementations.ts`（新增，20 条）**：有三个流的**契约先合并、实现后拆走**——预售（契约随 D 进来，实现是 D2）、统计（随 F2 进来，实现是 F3）、公众号 webhook（随 E2 进来，路由是 E3）。契约有、路由文件没有，按字面就是 20 个 404；`contracts` 和 `permissions` 现在对这 20 个 id 报 `pending(<stream>)` 而不是 `fail`。同样精确双向比对：路由文件一旦出现、原子一旦被声明，该条目就**报错**要求删除。K2 期望这份清单是空的。
- **`lib/marker-reassignments.ts` 重写**：34 条 `CONTRACT-PENDING` 标记原本指向 H 收拢后的流 S，S 已合并，于是全部改指 **H2**——H2 要么把契约补上，要么把调用删掉（CR-6-k 的后续）。
- **`route-hygiene` 的 `AUDIT_EXEMPT` 从 3 条涨到 26 条**：随 E2 合并进来的通知 / 公众号写接口有 21 个不写 `ctx.audit(target)` → **CR-17-k**；通知收件箱的两个「标记已读」是**决定**（本人读自己的收件箱，`handle()` 已经记了 actor），不是缺陷，带理由不带 CR。

细节见 `next/guards/README.md`。

### 2. 不变量审计（K-hardening §2）

作为 `invariants` 检查实现，三份账本互相比对：`tests/regression/cases.md`（131 条）、`docs/rewrite/invariants.md`（273 行）、`tests/regression/risk-matrix.md`（78 条）。

- 131 条遗留用例全部在账本里有行；
- 478 个 test id 全部解析到**真实存在**的测试（解析器读三种写法：普通字符串、模板字面量、`it.each(table)('…')`，并允许账本用 `<…>` 省略重复部分）；
- 78 条风险矩阵条目经 K 自己的 `lib/risk-map.ts` 连到账本行；矩阵 → 映射 → 账本三向比对，任何一边多出或少掉都报错；
- 未合并流拥有的 `unmapped` 行报 `pending:<ws>`，按「未决」而非「失败」计：199 ported、22 retired/dropped、64 pending。

**CR-2-k**（`invariants.md` 归编排者所有，K 不能改；提案以机器可读形式放在 `guards/src/lib/pending-edits.ts`，精确比对）rebase 后重写了一遍：

- 第一轮已被采纳的部分（MIG-001…017 转 `retired`、USER-001/002/003 落定）——条目已从 `pending-edits.ts` 删除，清单只能变小；
- **AUTH-001/002/003 从「指派给 E1」改成 `map`**：E1 已合并，已经合并的流不能再接活；这三行的行为 E1 其实早就实现了，落下的只是账本行。AUTH-001 需要一句 **Adapted**——重写只读一个 authorization 头，CRMEB 的 `Authori-zation` 兜底没有后继（`grep -r "Authori-zation"` 全仓零命中）。AUTH-003 问了两件事，跨用户订单隔离在**读**和**写**两侧都有断言，且陌生人拿到的 404 与「不存在的 id」完全一致——这比要求的更强，隔离不泄漏存在性。
- **STOCK-004 / QUEUE-008 / REFUND-002 / REFUND-003 → D2**：D 合并时拼团那一半已经做完，行里自己就写着「group-buy half is done」，预售那一半是 D2 的。
- **OPS-001…011 / REL-001…007 → J2（`CR-2-j2`）**：J 交付了 ETL 和发布脚本，真正能**证明**这些行的演练是 J2 的；J2 的 `status/j2.md` 里 CR-2-j2 已经在请编排者把这些行映射到演练 case id。本 CR 只是不让它们在期间以「已合并流的 unmapped」身份被判为失败。
- **ETL-F1-003 的两个 test id 跟着代码搬了家**：CR-1-j 把配置路由从 system mapper 挪到 `packages/etl/src/config.ts`（一个遗留键可以有多个认领者，一对一的 map 表达不了）。两半在搬家途中都变**强**了：没人认领的键不再是「被列出来」，而是直接让整趟迁移失败。
- **SMOKE-001 写了两行**：运费那一节有完整的一行（`ported`，指向 `FreightPort.quote`），商城冒烟那一节还留着原来空的 `unmapped` 行。重复行默认是 `fail`（账本自己的计数会错，读者也分不清哪行当真），这一条记在新的 `DUPLICATE_ROWS` 里并注明**保留哪一行**，于是这个 id 按「该留下的那行」判定，而不是按文件里先出现的那行。

风险矩阵也跟着 rebase 动了：三条拼团条目不再「停在 D」，直接判给 D 已经写出来的 RISK-D-001/002/003——其中 “Group create on payment” 解析到 RISK-D-001 是把它**反过来**了（开团发生在下单事务里而不是支付时，所以不存在「付了钱却没有团」），这是对该风险更强的回答，不是漏项；两条预售条目改停 D2，十一条部署条目改停 J2。

### 3. 后台端到端 `next/e2e/admin`（K-hardening §3）

一条命令，真栈：Testcontainers 起 PostgreSQL 17 + Redis 7 → 建库灌 schema → 播种 → `next build` → `next start` → Playwright（chromium，`workers: 1`）。网关全是 fake，不打任何真实 WeChat / SMS / Aliyun 端点。

```
30 tests: 29 passed, 1 skipped   （热跑 44.8 s；首次冷跑要拉镜像 + 构建，几分钟）
```

唯一的 skip 是 `specs/order.spec.ts` 的 “ship it, then confirm receipt”，`test.fixme` 指向 **CR-15-k**——它不是测试写不出来，是产品真的坏了（见下）。紧随其后的第三条用例仍然证明了「已发货的单不再出现发货按钮」，办法是绕开 UI、直接用服务层（内存队列）把发货这一步布置好。

十个 spec 与 `AUDIT.md` 行的对应表在 `next/e2e/admin/README.md`。

**这一遍最值钱的一条：CR-15-k 是 e2e 查出来的，而且只可能被 e2e 查出来。** 所有单元 / 集成测试都用 `memoryQueue()` 构造 `Ctx`，而 `memoryQueue()` 接受任意 `dedupeKey`；真的 BullMQ 6 拒绝带**一个**冒号的 `jobId`，而仓库里三个 key 全是 `name:id` 这个形状。于是发货、确认收货、**下单**都是事务提交之后再入队 → 数据库动了、HTTP 答 500。这条已经被写成 `AUDIT.md` 的 K-SEC-X7，作为一类问题：**假件必须拒绝真件会拒绝的东西**。

### 4. 安全复查（K-hardening §5）

`docs/rewrite/AUDIT.md`：四个面 —— 认证 / 支付 / 退款 / 上传 —— 逐条以攻击者视角读，加 PLAN §5 的十项「修而不搬」对照表和一节跨切面。共 41 行，每行的结局只有三种：**指名到具体测试**、**一个 CR**、或**写下理由的决定**，没有「看起来没问题」。

rebase 后已更新其中的守卫计数，并把「本遍未覆盖」一节改成按流标注**是否已合并**——D、E1、E2、F2、J 都已合并，也就是说 K2 一开工就能读，不用再等。

## 变更请求

| CR          | 给谁                           | 内容                                                                                                                                                                                                                              |
| ----------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CR-1-k**  | 编排者                         | `domains.gen.ts` 用未使用的 `import * as x` 装载 8 个域，esbuild 会把它删掉 → `apps/worker` 的 bundle 里只有 6 个域。SWC 和 oxc 都保留，所以测试全绿、bundle 是错的                                                               |
| **CR-2-k**  | 编排者                         | `invariants.md`：51 行状态 / owner 不对、4 个 test id 解析不到、1 个 id 写了两行。机器可读副本在 `guards/src/lib/pending-edits.ts`（`PENDING_EDITS` / `LEDGER_CORRECTIONS` / `DUPLICATE_ROWS`）。第一轮已采纳的部分已从清单中删除 |
| **CR-3-k**  | C                              | AUTH-005：`refund.service.ts` 已经对别人的退款单答 `REFUND_NOT_FOUND`（与「不存在」同码同文，防探测），但没有任何测试断言它                                                                                                       |
| **CR-4-k**  | 编排者                         | CI YAML：`static` 作业加一步 `pnpm guards`；新增 50 轮并发浸泡作业（STAB-001，定时 + 手动，非合并门）；新增 admin e2e 作业。均为可直接粘贴的 YAML                                                                                 |
| **CR-5-k**  | F1                             | `POST /admin-api/attachments/scan-tokens` 铸造的是一枚**凭证**（未认证手机可据此以该管理员身份上传），审计行却没有 target，没法把上传回溯到铸造                                                                                   |
| **CR-6-k**  | H2                             | 34 个 `CONTRACT-PENDING` 标记指向已合并的流：A/B1/B2/F1/G1 的缺口曾被收拢进流 S，S 也已合并，现在全部改指 H2。要么补契约，要么删调用                                                                                              |
| **CR-7-k**  | 提案（P0-B 的接缝 + K 第二遍） | 组件测试的 fixture 从不与契约响应 schema 比对（`customers.test.tsx` 在 `8a03f8cb` 修的就是这个类），提案 `respondWith(route, value)` 助手 + 强制走它的守卫                                                                        |
| **CR-8-k**  | 编排者 / P0-A                  | 改密码不会踢掉超过 32 小时的管理员会话：per-admin 索引 TTL 不续期，而会话键每次请求都续期；store 注释承诺的 `passwordVersion` 第二道保险在管理端并不存在                                                                          |
| **CR-9-k**  | 编排者 / P0-A                  | 审计日志只脱敏第一层，而每一个密钥都在第二层（`values.aliyunAccessKeySecret`、`body.config.*`），于是明文密钥被写进 `audit_logs.payload`                                                                                          |
| **CR-10-k** | C                              | 「加一条备注」和「改退货地址」共用同一个写原子：给客服备注权限就等于给了改收货地址的权限                                                                                                                                          |
| **CR-11-k** | F1                             | `safeFetch` 把连接钉到判定过的 IP，却把 URL 的 host 也换成了 IP 字面量 —— SNI 与证书校验都用 IP，于是每一个 https 导入都握手失败。修法不能是关证书校验                                                                            |
| **CR-12-k** | F1                             | 扫码上传的公开端点没有任何限流；`COMPLETE_LUA` 宣称做状态 CAS，实际没有检查它说的那个状态                                                                                                                                         |
| **CR-13-k** | J2                             | 本地存储驱动下，上传的文件从应用自己的 origin 提供，且没有 `nosniff`：一个被接受的文件类型就是一次同源 XSS                                                                                                                        |
| **CR-14-k** | B2 + C                         | `/api/v1/staff/refunds*` 永远只能答 403：staff 路由转发进管理端服务，而那些服务要的是管理员原子，staff 身份拿不到                                                                                                                 |
| **CR-15-k** | 编排者 / P0-A                  | **e2e 查出来的**：`dedupeKey` 全是 `name:id`，BullMQ 6 拒绝带一个冒号的 `jobId`。发货、确认收货、**下单**都是事务提交之后再入队，于是数据库动了、HTTP 答 500。全仓测试都用 `memoryQueue()`，所以谁也看不见                        |
| **CR-16-k** | 编排者 / P0-B                  | 用户菜单的「个人资料」push 到不存在的 `/admin/profile`（真正的页面在 `/admin/system/profile`）；`RequirePermission` 导出了、写了文档、没有任何页面用它                                                                            |
| **CR-17-k** | N1（3 个）+ E3（18 个）        | 随 E2 合并进来的 21 个通知 / 公众号写接口不调 `ctx.audit(target)`。最尖的是 `POST /admin-api/wechat-menus/:id/publish`（推送给全体关注者）和 `wechat-media/sync`：出事之后审计日志只能说「某人在 14:31 发布了某物」               |

## 新增依赖

`next/pnpm-lock.yaml` **未提交**（按规则）。两个新包的 manifest 已提交：

- `next/guards/package.json`
  - dependencies：`@shop/contracts`、`@shop/core`（workspace）、`zod ^4.6.5`
  - devDependencies：`@shop/config`（workspace）、`@types/node ^24`、`eslint ^10.11.0`、`tsx ^4.20.0`、`typescript ^7.0.2`、`vitest ^5.0.1`
- `next/e2e/admin/package.json`
  - dependencies：`@shop/contracts`、`@shop/core`、`@shop/db`、`@shop/testing`（workspace）、`drizzle-orm ^0.45.2`、`ioredis ^6.0.0`、`pg ^8.23.0`、`testcontainers ^12.1.0`
  - devDependencies：**`@playwright/test ^1.63.0`（唯一一个仓库里原先没有的包）**、`@shop/config`（workspace）、`@types/node ^24.0.0`、`@types/pg ^8.11.0`、`eslint ^10.11.0`、`tsx ^4.20.0`、`typescript ^7.0.2`

除 `@playwright/test` 外全部是仓库已有版本。编排者合并后需要跑一次 `pnpm install` 写锁文件，另外**浏览器二进制不进仓库**，首次运行前要：

```sh
pnpm --filter @shop/e2e-admin exec playwright install chromium   # 约 150 MB
```

CI 里这一步写在 CR-4-k 的 e2e 作业里。

## 需要编排者动的、不属于 K 的东西

1. `.github/workflows/next.yml` —— CR-4-k 的三个作业（`pnpm guards`、admin e2e、50 轮浸泡）。K 不碰 `.github/`。
2. `docs/rewrite/invariants.md` —— CR-2-k 的 51 行 + 4 个 id + 1 个重复行。
3. `next/packages/core/scripts/gen-config-groups.ts` —— CR-1-k。
4. `next/pnpm-lock.yaml` —— 按规则未提交，需要合并后 `pnpm install` 重写。
5. **CR-15-k 是发布阻断级的**：不是「以后修」，是**任何**走真 Redis 的环境里下单都会 500。建议优先于其他 K 的 CR。

## 第二遍（K2）

按 `K1-hardening-early.md` 的 “Not now” 加上本遍发现的：

- [ ] **负载冒烟（K-hardening §4）** —— J2 的 `deploy/next/compose.yml` 已经写出来了，阻塞已解除。
- [ ] **守卫与不变量终跑** —— 全部流合并后，把 `pending` 提升为致命：`lib/streams.ts` 的 `STREAM_STATE` 全改 `merged`，然后清掉所有 `pending` 条目。届时应当都能删干净的：`lib/pending-implementations.ts`（**整个文件**）、`marker-reassignments.ts`（34 条，等 H2）、`pending-edits.ts`（等 CR-2-k 落地）、`HAND_BUILT` 里的 SSE 项、`AUDIT_EXEMPT` 里带 `cr` 的 22 条（CR-5-k + CR-17-k），`FETCH_ALLOW` 里的 `wechat-oa/` 项（等 E3 把出站调用收进 seam）。
- [ ] **SEQ-001** —— 固定种子的交错序列，D 和 E1 都已合并，可以做了。
- [ ] **MUT-001** —— 对十项保护做变异测试。
- [ ] **STAB-001** —— 50 轮并发浸泡，YAML 已在 CR-4-k 里写好。
- [ ] **CR-7-k 的守卫** —— 等 `respondWith` 助手落地后再写 `component-fixtures` 检查。
- [ ] **CR-15-k 落地后解掉 `specs/order.spec.ts` 的 `test.fixme`**，并把用服务层布置发货的第三条用例改回走 UI。
- [ ] **补 spec**：预售（D2）、统计（F3）、公众号（E3）、通知（N1）合并后各自补 e2e；`next/e2e/admin/README.md` 末节有清单。
- [ ] **重读 `AUDIT.md` 里所有 `pending:` 行** —— E1（含 PLAN §5 第 8 项短信验证码重放、K-SEC-A11）、E2、D、F2、J 都已合并，这是 K2 的第一件事，不是最后一件。另外随 E2/E3 进来的 19 个公众号后台路由**完全没有**被攻击者视角读过。
- [ ] 重新核对 `AUDIT.md` 里标 “re-check in K2” 的行（K-SEC-A4、P6、P7、R6、R10、U8）。
