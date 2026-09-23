# CR-7-i — the default product page shows no 分享 and prints the product as raw JSON

- **Stream:** found by the orchestrator in I's merge gate (the first run of the storefront suite with W5T on integration); routed to **H4**
- **Status:** OPEN
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
