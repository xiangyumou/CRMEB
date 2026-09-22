#!/usr/bin/env node
/**
 * `etl plan | run | verify | assets`.
 *
 * Both connection strings come from the **environment**, never from argv:
 * `LEGACY_MYSQL_URL` and `DATABASE_URL`. Argv is world-readable in `ps` on a
 * shared host and lands in shell history, and one of these two strings is the
 * credential for a database that is still serving live traffic.
 *
 * Nothing printed here is a config value. The run report carries keys and
 * `<set>` / `<empty>` markers (`lib/secrets.ts`); a migration log is read over
 * someone's shoulder, pasted into a ticket and kept in CI for ninety days.
 *
 * Exit codes: 0 success, 1 a check or a group failed, 2 the invocation itself
 * was wrong. `upgrade.sh` distinguishes them.
 */

import { parseArgs } from 'node:util';

import { assets } from './assets';
import { plan, run, type GroupResult } from './runner';
import { openSource, type Source } from './source';
import { openTarget, type Target } from './target';
import { verify } from './verify';

const USAGE = `用法：etl <命令> [选项]

命令：
  plan                  只读：数一数旧库每张源表有多少行，列出会写入哪些新表
  run                   迁移。一个 group 一个事务；跑两次结果相同
  verify                比对新旧两边：行数、金额合计、DIY JSON、附件文件、外键、序列
  assets                生成 uploads 复制计划和 sha256 清单（默认不复制）

连接串只从环境变量读，不接受命令行参数（argv 会进 ps 和 shell 历史）：
  LEGACY_MYSQL_URL      旧库，只读打开
  DATABASE_URL          新库

run 的选项：
  --group <name>        只跑这一个 group
  --dry-run             照常映射并试插入，最后回滚
  --require-complete    只要还有 group 的 mapper 没落地就直接失败（切换正式环境用）
  --allow-invalid-config  不满足 schema 的配置项回落到默认值，而不是中止
  --uploads-root <dir>  旧 uploads 目录，用来算附件 sha256
  --migrated-at <ISO>   这次迁移算作发生在哪一刻（默认现在）。旧库没有时间可搬的行
                        用它来填 created_at，所以重跑时给上一次的值，就能得到逐字节
                        相同的结果；演练脚本正是这样比对两遍的
  --json                把报告打成 JSON

verify 的选项：
  --uploads-root <dir>  同上
  --full-digest         校验每一个附件文件，而不是抽样

assets 的选项：
  --uploads-root <dir>  旧 uploads 目录（源）
  --dest <dir>          新栈挂载 uploads 的目录
  --out <dir>           清单和文件列表的输出目录（默认 ./etl-out）
  --execute             真的执行 rsync
  --rsync-dry-run       给 rsync 加 -n
`;

interface Connections {
  source?: Source;
  target?: Target;
}

async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return command === undefined ? 2 : 0;
  }

  let options: ReturnType<typeof parseArgs>;
  try {
    options = parseArgs({
      args: argv.slice(1),
      allowPositionals: false,
      options: {
        group: { type: 'string' },
        'dry-run': { type: 'boolean' },
        'require-complete': { type: 'boolean' },
        'allow-invalid-config': { type: 'boolean' },
        'uploads-root': { type: 'string' },
        'migrated-at': { type: 'string' },
        'full-digest': { type: 'boolean' },
        dest: { type: 'string' },
        out: { type: 'string' },
        execute: { type: 'boolean' },
        'rsync-dry-run': { type: 'boolean' },
        json: { type: 'boolean' },
      },
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 2;
  }
  const flags = options.values;
  /** `parseArgs` types every value as `string | boolean | […]`; narrow once. */
  const str = (name: string): string | undefined => {
    const value = flags[name];
    return typeof value === 'string' ? value : undefined;
  };
  const bool = (name: string): boolean => flags[name] === true;
  const log = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  const open: Connections = {};

  try {
    switch (command) {
      case 'plan': {
        open.source = await openSource(requireEnv('LEGACY_MYSQL_URL'));
        log(`旧库：${open.source.label}`);
        const planned = await plan({
          source: open.source,
          ...(str('group') === undefined ? {} : { group: str('group')! }),
        });
        if (bool('json')) {
          log(JSON.stringify(planned, null, 2));
          return 0;
        }
        for (const group of planned) {
          const missing = group.sources.filter((s) => !s.exists && !s.optional);
          log(
            `\n${group.group} — ${group.title}` +
              (group.pending ? `  [pending，owner: ${group.owner}]` : ''),
          );
          for (const source of group.sources) {
            const where = source.where === undefined ? '' : ` where ${source.where}`;
            log(
              `  ${source.exists ? ' ' : '!'} ${source.table}${where}: ` +
                (source.exists ? `${String(source.rows)} 行` : '旧库里没有这张表'),
            );
          }
          log(`  → ${group.targets.join(', ')}`);
          for (const dependency of group.softDependencies.filter((d) => d.pending)) {
            log(`  ⚠ 依赖 ${dependency.group} 的 ${dependency.table}，但那个 group 还没落地`);
          }
          if (missing.length > 0) {
            log(`  ⚠ 缺少必需的源表：${missing.map((s) => s.table).join(', ')}`);
          }
        }
        return 0;
      }

      case 'run': {
        // Parsed before anything is opened: a typo here should cost nothing.
        // An instant is either given exactly or not at all — no "close enough"
        // parse of a half-typed date, because the value ends up stored as the
        // creation time of every row the legacy schema had no timestamp for.
        let migratedAt: Date | undefined;
        const given = str('migrated-at');
        if (given !== undefined) {
          migratedAt = new Date(given);
          if (Number.isNaN(migratedAt.getTime())) {
            process.stderr.write(`--migrated-at 不是一个时间：${given}\n`);
            return 2;
          }
        }
        open.source = await openSource(requireEnv('LEGACY_MYSQL_URL'));
        open.target = await openTarget(requireEnv('DATABASE_URL'));
        log(`旧库：${open.source.label}`);
        log(`新库：${open.target.label}`);
        if (bool('dry-run')) log('试运行：会真的插入，最后回滚。');
        const result = await run({
          source: open.source,
          target: open.target,
          ...(str('group') === undefined ? {} : { group: str('group')! }),
          ...(bool('dry-run') ? { dryRun: true } : {}),
          ...(bool('require-complete') ? { requireComplete: true } : {}),
          ...(bool('allow-invalid-config') ? { allowInvalidConfig: true } : {}),
          ...(str('uploads-root') === undefined ? {} : { uploadsRoot: str('uploads-root')! }),
          ...(migratedAt === undefined ? {} : { migratedAt }),
          log,
        });
        if (bool('json')) {
          log(JSON.stringify(result, null, 2));
        } else {
          printRunReport(result.groups, log);
          if (result.pending.length > 0) {
            log(`\n还没落地的 group（这些域一行数据都没迁）：`);
            for (const item of result.pending) log(`  ${item.group} — owner: ${item.owner}`);
          }
        }
        log(`\n用时 ${String(result.durationMs)}ms`);
        // Printed even when it was defaulted, because that is the value a
        // repeat run needs to reproduce this one byte for byte.
        log(`迁移时刻：${result.migratedAt.toISOString()}（重跑时 --migrated-at 传回它）`);
        return 0;
      }

      case 'verify': {
        open.source = await openSource(requireEnv('LEGACY_MYSQL_URL'));
        open.target = await openTarget(requireEnv('DATABASE_URL'));
        log(`比对 ${open.source.label} → ${open.target.label}`);
        const result = await verify({
          source: open.source,
          target: open.target,
          ...(str('uploads-root') === undefined ? {} : { uploadsRoot: str('uploads-root')! }),
          ...(bool('full-digest') ? { fullDigest: true } : {}),
          log,
        });
        if (bool('json')) log(JSON.stringify(result, null, 2));
        const failed = result.checks.filter((check) => !check.ok);
        log(
          `\n${String(result.checks.length - failed.length)}/${String(result.checks.length)} 项通过`,
        );
        if (result.pending.length > 0) {
          log(`还没落地的 group：${result.pending.map((p) => p.group).join(', ')}（不参与比对）`);
        }
        if (failed.length > 0) {
          log(`\n没通过的检查：`);
          for (const check of failed) log(`  ${check.group}/${check.name}: ${check.detail}`);
          return 1;
        }
        return 0;
      }

      case 'assets': {
        const sourceRoot = str('uploads-root');
        const destRoot = str('dest');
        if (sourceRoot === undefined || destRoot === undefined) {
          process.stderr.write('assets 需要 --uploads-root 和 --dest\n');
          return 2;
        }
        open.target = await openTarget(requireEnv('DATABASE_URL'));
        await assets({
          target: open.target,
          sourceRoot,
          destRoot,
          outDir: str('out') ?? './etl-out',
          ...(bool('execute') ? { execute: true } : {}),
          ...(bool('rsync-dry-run') ? { dryRun: true } : {}),
          log,
        });
        return 0;
      }

      default:
        process.stderr.write(`未知命令 "${command}"\n\n${USAGE}`);
        return 2;
    }
  } finally {
    await open.source?.close().catch(() => undefined);
    await open.target?.close().catch(() => undefined);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `环境变量 ${name} 没有设置。连接串只从环境读，不从命令行参数读：` +
        `argv 会出现在 ps 输出和 shell 历史里。`,
    );
  }
  return value;
}

function printRunReport(groups: readonly GroupResult[], log: (line: string) => void): void {
  for (const group of groups) {
    if (group.status === 'pending') continue;
    log(`\n${group.group} — ${group.title}  [${group.status}]`);
    for (const source of group.sourceRows) log(`  读 ${source.table}: ${String(source.rows)} 行`);
    for (const table of group.tables) {
      const dropped = table.mapped - table.inserted;
      log(
        `  写 ${table.table}: ${String(table.inserted)} 行` +
          (dropped > 0 ? `（映射出 ${String(table.mapped)}，丢弃 ${String(dropped)}）` : '') +
          (table.sequence === null ? '' : `，序列 → ${String(table.sequence)}`),
      );
    }
    for (const note of group.notes) log(`  · ${note}`);
    if (group.report !== undefined) {
      log(`  报告 ${JSON.stringify(group.report)}`);
    }
    if (group.error !== undefined) log(`  失败：${group.error}`);
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
