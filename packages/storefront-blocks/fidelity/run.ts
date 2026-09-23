/**
 * Fidelity check for the spike blocks (S3). Not part of CI.
 *
 * Screenshots each block, at a 375 px wide phone, from
 *
 *   1. the admin editor canvas: `/admin/dev/decor-spike`, inside Puck's iframe,
 *      where the blocks render through the DOM shim with the px → vw
 *      stylesheet; and, when `--h5` is given,
 *   2. the Taro H5 build: a dev page that renders the same fixtures with the
 *      real `@tarojs/components` and pxtransform,
 *
 * and diffs each pair with pixelmatch. Both pages must put `data-block="<type>"`
 * on each block's outer element (the blocks do so themselves).
 *
 *   pnpm --filter @shop/web build && pnpm --filter @shop/web start   # :3000
 *   pnpm --filter @shop/storefront-blocks fidelity -- \
 *     --admin http://localhost:3000 \
 *     [--h5 http://localhost:10086/#/pages/dev/blocks] [--out ../../docs/mini/spikes/S3]
 *
 * The admin session is client-side (`GET /admin-api/auth/me`); the script
 * answers every `/admin-api/*` request itself, so no database or sign-in is
 * needed and nothing leaves the machine.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium, type Frame, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const BLOCKS = ['carousel', 'productGrid', 'imageCube'] as const;
type Block = (typeof BLOCKS)[number];

const { values } = parseArgs({
  options: {
    admin: { type: 'string', default: 'http://localhost:3000' },
    h5: { type: 'string' },
    out: { type: 'string', default: 'fidelity/.out' },
    threshold: { type: 'string', default: '0.1' },
  },
});

/** Progress goes to stdout: this is a CLI, not library code. */
function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

const out = resolve(values.out);
mkdirSync(out, { recursive: true });

/** The contract example for `GET /admin-api/auth/me`: a super admin. */
const ME = {
  id: '1',
  account: 'admin',
  name: '超级管理员',
  avatar: null,
  isSuper: true,
  permissions: [],
};

async function stubAdminApi(page: Page): Promise<void> {
  await page.route('**/admin-api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/admin-api/auth/me') {
      await route.fulfill({ json: ME });
    } else if (url.pathname.endsWith('/stream')) {
      await route.abort();
    } else {
      await route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'fidelity stub' } });
    }
  });
}

/** Waits until every `<img>` in the frame has decoded. */
async function imagesSettled(frame: Frame | Page): Promise<void> {
  await frame.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
  );
}

async function shootAdmin(): Promise<Record<Block, Buffer>> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1200 },
      deviceScaleFactor: 2,
    });
    await stubAdminApi(page);
    await page.goto(new URL('/admin/dev/decor-spike', values.admin).href);
    const frameElement = await page.waitForSelector('[data-testid="decor-editor"] iframe', {
      timeout: 60_000,
    });
    const frame = await frameElement.contentFrame();
    if (!frame) throw new Error('the editor canvas iframe has no frame');
    await frame.waitForSelector('[data-block="imageCube"]');
    await imagesSettled(frame);
    // Nothing hovered or selected: Puck draws outlines over the canvas otherwise.
    await page.mouse.move(0, 0);
    const width = await frame.evaluate(() => document.documentElement.clientWidth);
    let box = await frameElement.boundingBox();
    if (box && Math.round(box.width) !== width) {
      // Puck zooms the canvas out when the editor is narrow; shots must be at 100 %.
      await page.locator('select:has(option[value="1"])').first().selectOption('1');
      await page.waitForTimeout(500);
      box = await frameElement.boundingBox();
    }
    say(`admin canvas: ${width}px wide, iframe box ${JSON.stringify(box)}`);
    if (!box || Math.round(box.width) !== width) {
      throw new Error(`the canvas is zoomed (${box?.width ?? '?'} px on screen for ${width} px)`);
    }
    writeFileSync(resolve(out, 'admin-editor.png'), await page.screenshot());
    // A block taller than the canvas would be clipped by the editor's own
    // scroll box: stretch the editor so the whole page fits, then shoot.
    await page.setViewportSize({ width: 1920, height: 3200 });
    await page.locator('[data-testid="decor-editor"]').evaluate((element) => {
      (element as HTMLElement).style.height = '3000px';
    });
    await page.waitForTimeout(500);
    await page.mouse.move(0, 0);
    const shots = {} as Record<Block, Buffer>;
    for (const block of BLOCKS) {
      shots[block] = await frame.locator(`[data-block="${block}"]`).first().screenshot();
      writeFileSync(resolve(out, `admin-${block}.png`), shots[block]);
    }
    return shots;
  } finally {
    await browser.close();
  }
}

async function shootH5(url: string): Promise<Record<Block, Buffer>> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await page.goto(url);
    await page.waitForSelector('[data-block="imageCube"]', { timeout: 60_000 });
    await imagesSettled(page);
    const shots = {} as Record<Block, Buffer>;
    for (const block of BLOCKS) {
      shots[block] = await page.locator(`[data-block="${block}"]`).first().screenshot();
      writeFileSync(resolve(out, `h5-${block}.png`), shots[block]);
    }
    return shots;
  } finally {
    await browser.close();
  }
}

interface DiffResult {
  block: Block;
  admin: string;
  h5: string;
  mismatched: number;
  total: number;
  percent: number;
}

/** Diffs two screenshots over their common area; a size difference is reported, not hidden. */
function diff(block: Block, adminPng: Buffer, h5Png: Buffer): DiffResult {
  const a = PNG.sync.read(adminPng);
  const b = PNG.sync.read(h5Png);
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const crop = (png: PNG): Buffer => {
    const target = new PNG({ width, height });
    PNG.bitblt(png, target, 0, 0, width, height, 0, 0);
    return target.data;
  };
  const output = new PNG({ width, height });
  const mismatched = pixelmatch(crop(a), crop(b), output.data, width, height, {
    threshold: Number(values.threshold),
  });
  writeFileSync(resolve(out, `diff-${block}.png`), PNG.sync.write(output));
  // Pixels outside the common area are all mismatches.
  const total = Math.max(a.width, b.width) * Math.max(a.height, b.height);
  const all = mismatched + (total - width * height);
  return {
    block,
    admin: `${a.width}×${a.height}`,
    h5: `${b.width}×${b.height}`,
    mismatched: all,
    total,
    percent: Math.round((all / total) * 10_000) / 100,
  };
}

const admin = await shootAdmin();
say(`admin screenshots → ${out}`);
if (values.h5) {
  const h5 = await shootH5(values.h5);
  const results = BLOCKS.map((block) => diff(block, admin[block], h5[block]));
  say(JSON.stringify(results, null, 2));
  writeFileSync(resolve(out, 'fidelity.json'), `${JSON.stringify(results, null, 2)}\n`);
} else {
  say('no --h5 URL: admin screenshots only, nothing to diff against');
}
