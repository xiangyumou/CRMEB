# CR-7-i — the default product page shows no 分享 and prints the product as raw JSON

- **Stream:** found by the orchestrator in I's merge gate (the first run of the storefront suite with W5T on integration); routed to **H4**
- **Status:** **done** (H4, see "Resolution" below)
- **Affects:** `next/packages/contracts/src/diy/**` (W5T's built-in `product_detail` default page), `template/uni-app/subpackage/diyComponents/**` / `pages/goods_details/index.vue` (whichever maps the page's components)

With W5T merged, `pages/goods_details/index` renders the built-in default product page instead of a
blank body (CR-2-h3). Two things are wrong with what it renders (screenshot in the gate's
`test-results/site-config-share-*`):

1. **No 分享 control.** `site-config-share.spec.ts` › "a product's share panel opens with a poster
   action" cannot find `分享`; the legacy product page offers it (header/productInfo share →
   生成海报 panel). The default page, or the component props it sets, leave it out.
2. **The product is printed as JSON.** Below the price block a component renders
   `{ "price": "39.00", "ot_price": "", "vip_price": 0, … }` as text — a component bound to the
   whole product object where it expects a string (or a default prop value the uni-app component
   does not understand).

**Ask:** make the default page match what the uni-app components expect (component keys and props
from the legacy default detail template in `crmeb/`), so the page shows gallery, price, name, the
share control and the description — never raw JSON; lift the `blockedBy('CR-7-i: …')` in
`next/e2e/storefront/specs/site-config-share.spec.ts`, and add an assertion to a product-page
journey that no `{ "` text is on screen.

## Resolution (H4)

The raw JSON was not the DIY page: it was `components/shareRedPackets` — the legacy 分销
「最高返佣 · 立即分享」 badge — printing `priceName`, which `api/mappers/catalog.js` had turned
into a `{ price, ot_price, vip_price, member_price }` object. `goods_details` shows the badge when
`priceName != 0`, and an object is never `0`. 分销 is retired, so `priceName` is pinned to `0`: the
badge never renders.

That badge was also the legacy page's only H5 entry to the share panel: the legacy default's
`bottomMenu.showContent.type` is `[3, 1, 2]` (首页, 收藏, 购物车), and `productInfo`'s own share
icon is commented out in the legacy source. So the built-in default
(`next/packages/contracts/src/diy/product-detail.default.json`) now shows `[3, 1, 2, 4]` — 分享 in
the bottom bar, the one deliberate difference from the legacy payload, recorded in
`product-detail.default.ts`. `PRODUCT_DETAIL_DEFAULT_VERSION` is unchanged (`core`'s int test pins
it and is not H4's; nothing is deployed that could hold the old default).

Found on the way: the product bar's 加入购物车 never rendered, because `productBottom.vue` reads
`storeInfo.cart_button` and the mapper emitted `can_add_cart`. The card mapper now emits
`cart_button` (1/0 from `canAddToCart`), which the category pages and `skuSelect` also read.

Tests: `product-detail.default.test.ts` (分享 in the bar), `tests/mappers.catalog.test.mjs`
(`priceName` 0, `cart_button`), `tests/mappers.misc.test.mjs`; the share journey is lifted, the
two product-page journeys assert `expectNoRawJson` (`e2e/storefront/src/product-flows.ts`) and
the seeded 图文详情.
