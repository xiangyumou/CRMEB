# CR-3-h2 — the storefront decorates four surfaces, the contract decorates one

- **Stream:** H (uni-app storefront), raised against G1 (DIY / 装修)
- **Status:** open
- **Affects:** `next/packages/contracts/src/diy/storefront.contract.ts`

G1's storefront surface is four routes — `pages/home`, `pages/:id`, `theme`,
`version` — and the home page maps onto it exactly: `getThemeInfo('home')` and
`getDiyVersion` are live and their mappers are tested. The other three things
the app asks the 装修 system for have no route.

They are not legacy quirks. Each one is a screen an operator decorates in the
admin console that ships today, and each one degrades visibly without it.

## 1. 个人中心 — the "我的菜单" grid

`pages/user/index.vue` calls `getMenuList()` on every `onShow` and renders
`routine_my_menus`: the grid of tiles under the header (待付款/待收货/我的收藏/
地址管理/客服…), in the operator's order, with the operator's icons. Legacy also
returned `diy_data` in the same payload — the 个人中心 版式 (which header style),
「我的横幅」 and the 商家入口 toggle.

Without it the page renders an empty grid. There is no built-in fallback list:
the tiles have always come from the server.

**Ask:** `GET /api/v1/diy/pages/user-center`, `auth: 'public'`, answering the
same `diyPage` shape the home page answers with, plus `version`/`ETag` so the
app can poll it the same way. If G1 would rather not special-case the path,
making `GET /api/v1/diy/pages/:id` accept a **slug** (`user-center`,
`category`) next to a numeric id covers this and §2 in one change.

## 2. 底部导航 (the custom tab bar)

`components/pageFooter/index.vue` is mounted on every tabbar page and calls
`getNavigation()`; `pages/goods_cate/goods_cate1.vue` calls it too. The response
decides whether the shop shows the native tab bar or a decorated one, and what
the middle button does.

Without it the component falls back to nothing and the shop has **no bottom
navigation at all** on the pages that use it.

**Ask:** either fold it into §1's payload (it is decorated on the same screen in
the console) or `GET /api/v1/diy/navigation`, `auth: 'public'`, answering
`{ enabled, items: [{ name, url, icon, activeIcon }], middle? }` with the same
`version` discipline.

## 3. The 版式 switch for 分类 and 个人中心

`getThemeInfo(type)` is called with `'category'` and `'user'` as well as
`'home'`. For those two the page reads exactly one field — `res.data.status` —
and picks between two hand-written layouts (`goods_cate1.vue` vs the default
grid; the two 个人中心 headers). It is a boolean, not a component tree.

**Ask:** nothing new if §1 lands — the switch can ride in that payload. If it
does not, the smallest possible route is
`GET /api/v1/diy/layouts?page=category|user` → `{ status: boolean }`.

## Worth deciding rather than assuming

All three are *public* reads of operator-authored layout. The admin side of
them already exists (`/admin-api/diy/pages`, including
`restore-default`/`save-default`), so the data is there; what is missing is the
read the app makes. If the answer is that this build ships fixed layouts and
retires per-shop decoration of these three surfaces, say so and H will delete
the three calls, hard-code the menu grid from the current default rows, and
drop `components/pageFooter` back to the native tab bar — that is a page-level
change and needs an owner, but it is a perfectly reasonable answer.

## Until then

- `getMenuList` (`api/user.js`) — `CONTRACT-PENDING(G1)` against
  `GET /api/v1/diy/pages/user-center`. 个人中心's tile grid is empty.
- `getNavigation` (`api/public.js`) — `CONTRACT-PENDING(G1)` against
  `GET /api/v1/diy/navigation`. The custom tab bar does not render.
- `getThemeInfo('category'|'user')` (`api/api.js`) — `CONTRACT-PENDING(G1)`
  against `GET /api/v1/diy/layouts/:type`. Both pages keep their default layout,
  which is the same thing the legacy call's failure branch did, so this one is
  cosmetic.
