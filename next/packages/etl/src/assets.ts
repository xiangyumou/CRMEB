/**
 * `etl assets` — moving the uploads tree, and proving it arrived.
 *
 * The plan copies **exactly the files the database references**, via an rsync
 * `--files-from` list, rather than the whole `public/uploads` directory. This
 * is deliberate and it is the most important decision in this file:
 *
 * - A ten-year-old CRMEB uploads tree is mostly garbage — orphaned thumbnails,
 *   test images, exports nobody deleted. Copying the referenced set is usually
 *   a large fraction smaller and always faster.
 * - More importantly, that tree is where an attacker's webshell lives if the
 *   shop ever had one. `videoDataSave` in the old system took a
 *   client-supplied path (`docs/release-readiness.md`), so this is not
 *   hypothetical. The edge config already refuses to execute anything under
 *   `/uploads/`, but not copying an unreferenced `.php` in the first place is
 *   the stronger half of that pair: two independent controls, either of which
 *   would have to fail alone.
 * - A file the new database does not reference cannot be reached through the
 *   new shop anyway, so nothing is lost by leaving it behind. The old tree is
 *   kept on the old host until the rollback window closes, which is where it
 *   belongs if anyone ever needs it.
 *
 * The manifest is the proof. It lists every referenced key with the `sha256`
 * that `run` already computed and stored, so after the copy `etl verify
 * --full-digest` re-hashes the destination and compares against the database.
 * "rsync exited 0" is not the same claim as "every image the shop will ask for
 * is there and is the right bytes".
 *
 * Nothing here executes anything unless `--execute` is passed. The default is
 * a printed plan, because the person running this is usually doing it for the
 * first time on a host where the destination path being wrong is expensive.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { localFilePath } from './lib/storage-keys';
import type { Target } from './target';

export interface AssetEntry {
  storageKey: string;
  /** Path relative to the uploads root, which is what rsync is given. */
  relativePath: string;
  sha256: string;
  size: number;
}

export interface AssetsPlan {
  entries: AssetEntry[];
  /** Keys no path could be derived from — traversal, NUL, empty. Never copied. */
  rejected: { storageKey: string; reason: string }[];
  totalBytes: number;
  /** Where the manifest was (or would be) written. */
  manifestPath: string;
  filesFromPath: string;
  /** The exact command, printed so it can be read before it is run. */
  command: string[];
}

export interface AssetsOptions {
  target: Target;
  /** The legacy uploads tree, e.g. `/mnt/legacy/public/uploads`. */
  sourceRoot: string;
  /** Where the new stack mounts its uploads volume, e.g. `/data/uploads`. */
  destRoot: string;
  /** Directory for the manifest and the files-from list. */
  outDir: string;
  /** Actually run rsync. Absent means print the plan and stop. */
  execute?: boolean;
  /** `rsync -n`. Meaningful only with `execute`. */
  dryRun?: boolean;
  log?: (line: string) => void;
}

export async function planAssets(options: AssetsOptions): Promise<AssetsPlan> {
  const rows = await options.target.query<{
    storage_key: string;
    sha256: string;
    size: string;
  }>(
    `select storage_key, sha256, size::text as size
       from attachments
      where driver = 'local' and deleted_at is null
      order by storage_key`,
  );

  const entries: AssetEntry[] = [];
  const rejected: { storageKey: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    // `localFilePath` is the same function the loader and `verify` use, so a
    // key that is refused here is refused everywhere — one definition of what
    // counts as a safe key, not three that can drift apart.
    const absolute = localFilePath(options.sourceRoot, row.storage_key);
    if (absolute === null) {
      rejected.push({
        storageKey: row.storage_key,
        reason: '这个 key 无法安全地落到 uploads 根目录下（含 .. 、NUL 或为空）',
      });
      continue;
    }
    const relativePath = absolute.slice(options.sourceRoot.replace(/\/+$/, '').length + 1);
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    entries.push({
      storageKey: row.storage_key,
      relativePath,
      sha256: row.sha256,
      size: Number(row.size),
    });
  }

  const manifestPath = `${options.outDir.replace(/\/+$/, '')}/uploads-manifest.json`;
  const filesFromPath = `${options.outDir.replace(/\/+$/, '')}/uploads-files-from.txt`;

  return {
    entries,
    rejected,
    totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    manifestPath,
    filesFromPath,
    command: [
      'rsync',
      '-a',
      '--info=progress2',
      // Times and permissions travel; ownership does not, because the
      // destination runs as a different uid and `--owner` would need root
      // there for nothing.
      '--no-owner',
      '--no-group',
      // The one flag that would silently break the copy is `--delete` against
      // the wrong destination, so it is not here and is not offered.
      `--files-from=${filesFromPath}`,
      `${options.sourceRoot.replace(/\/+$/, '')}/`,
      `${options.destRoot.replace(/\/+$/, '')}/`,
    ],
  };
}

export interface AssetsResult {
  plan: AssetsPlan;
  executed: boolean;
  /** rsync's exit status when it ran. */
  exitCode?: number;
}

export async function assets(options: AssetsOptions): Promise<AssetsResult> {
  const log = options.log ?? (() => undefined);
  const plan = await planAssets(options);

  await mkdir(dirname(plan.manifestPath), { recursive: true });
  await writeFile(plan.filesFromPath, plan.entries.map((e) => e.relativePath).join('\n') + '\n');
  await writeFile(
    plan.manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceRoot: options.sourceRoot,
        destRoot: options.destRoot,
        files: plan.entries.length,
        totalBytes: plan.totalBytes,
        rejected: plan.rejected,
        entries: plan.entries,
      },
      null,
      2,
    ) + '\n',
  );

  log(`  ${String(plan.entries.length)} 个文件，合计 ${formatBytes(plan.totalBytes)}`);
  log(`  清单：${plan.manifestPath}`);
  log(`  文件列表：${plan.filesFromPath}`);
  if (plan.rejected.length > 0) {
    log(`  拒绝了 ${String(plan.rejected.length)} 个不安全的 key（详见清单里的 rejected）`);
  }
  log(`  命令：${plan.command.join(' ')}`);

  if (options.execute !== true) {
    log('  （没有加 --execute，只生成计划，没有复制任何文件）');
    return { plan, executed: false };
  }

  const { spawn } = await import('node:child_process');
  const argv =
    options.dryRun === true ? [plan.command[0]!, '-n', ...plan.command.slice(1)] : plan.command;
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(
      `rsync 退出码 ${String(exitCode)}，文件没有完整复制。` +
        `不要继续切换：用 etl verify --full-digest 确认到底缺了哪些文件。`,
    );
  }
  log('  rsync 完成。请再跑一次 etl verify --full-digest 用 sha256 证明文件到位。');
  return { plan, executed: true, exitCode };
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit] ?? 'B'}`;
}
