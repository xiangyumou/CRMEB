import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The handoff between `scripts/serve.ts` (which owns the containers, the web
 * server, the worker, the fake gateway and the edge) and the specs (which need
 * the same database and Redis to arrange what the storefront cannot create by
 * itself, and to read back what it cannot show).
 *
 * A file rather than an environment variable, for the reason `@shop/e2e-admin`
 * gives: Playwright spawns the `webServer` command as a child, so the parent
 * cannot read anything the child discovers, and the container ports are only
 * known once the containers are up.
 *
 * It lives in the system temp directory, never in the repository, so no run
 * leaves behind something `git status` would show or `prettier` would
 * reformat. `SHOP_E2E_STOREFRONT_STACK` overrides it when two suites must not
 * collide — the admin suite already uses a different name, so the two can run
 * side by side.
 */

export const STACK_FILE =
  process.env.SHOP_E2E_STOREFRONT_STACK ?? path.join(tmpdir(), 'shop-e2e-storefront.json');

/**
 * The port the *browser* talks to: the edge, which serves the H5 bundle and
 * proxies `/api` to `next start`. Same origin, because `config/app.js` derives
 * the API origin from `window.location` on H5 — a storefront served from a
 * different origin than its API is not the thing production runs.
 */
export const EDGE_PORT = Number(process.env.SHOP_E2E_PORT ?? 3220);

/** `next start`. Nothing in the browser ever addresses it directly. */
export const WEB_PORT = Number(process.env.SHOP_E2E_WEB_PORT ?? 3221);

/** The fake WeChat Pay gateway. */
export const GATEWAY_PORT = Number(process.env.SHOP_E2E_GATEWAY_PORT ?? 3222);

export const BASE_URL = process.env.SHOP_E2E_BASE_URL ?? `http://127.0.0.1:${EDGE_PORT}`;

export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

/** A seeded identity. Passwords are fixtures and exist only in a throwaway database. */
export interface SeededUser {
  id: number;
  account: string;
  phone: string;
  password: string;
  nickname: string;
}

/** Everything the specs need that only the serve script can know. */
export interface StackInfo {
  /** The database the web server and the worker are talking to. */
  databaseUrl: string;
  /** The Redis they are talking to, including the logical db index. */
  redisUrl: string;
  /** The edge — what the browser opens. */
  baseUrl: string;
  /** Where uploads land, so a spec can assert a file really was written. */
  uploadsDir: string;
  /** The fake WeChat Pay gateway's origin. */
  gatewayUrl: string;
  /** The gateway control-plane's origin (`src/gateway-control.ts`) — how a
   * spec, running in a different process than the gateway, drives
   * `markPaid`/`postNotify` and `markRefunded`/`postRefundNotify`. */
  gatewayControlUrl: string;
  /** The super admin, for the `/admin-api` half of the ship and refund journeys. */
  admin: { account: string; password: string; id: number };
  /** The shopper, and the second shopper the group-buy journey needs. */
  users: { primary: SeededUser; secondary: SeededUser };
  /** Seeded ids the specs address by name instead of by guessing. */
  fixtures: StackFixtures;
}

export interface StackFixtures {
  categoryId: number;
  /** A multi-spec product: two specs, four SKUs, free freight. */
  multiSpecProductId: number;
  multiSpecSkuIds: number[];
  /** A single-SKU product behind a fixed-postage freight template. */
  postageProductId: number;
  postageSkuId: number;
  postageFreightTemplateId: number;
  /** The product both activities are attached to. */
  activityProductId: number;
  activitySkuId: number;
  couponTemplateId: number;
  groupBuyActivityId: number;
  presaleActivityId: number;
  primaryAddressId: number;
  secondaryAddressId: number;
  expressCompanyId: number;
  diyHomePageId: number;
  /** Every DIY page the seed published, with the component ids each should render. */
  diyPages: Array<{ fixture: string; id: number; kind: 'home' | 'micro'; componentIds: string[] }>;
}
