#!/usr/bin/env node
/**
 * One-off extractor: pull the reference rows out of the legacy install dump and
 * write them as JSON for `src/seed/`.
 *
 *   node scripts/extract-legacy-seed.mjs [path/to/crmeb.sql]
 *
 * The dump is 10 MB of MySQL, so it is streamed line by line rather than read
 * whole. Output goes to `seed-data/`; both the script and its output are
 * committed, so the seed never depends on the old repository being present.
 *
 * Tables read:
 *   eb_system_city  -> seed-data/cities.json
 *   eb_express      -> seed-data/express-companies.json
 */

import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const repoRoot = resolve(packageRoot, '../../..');

const sqlPath = resolve(process.argv[2] ?? `${repoRoot}/crmeb/public/install/crmeb.sql`);
const outDir = `${packageRoot}/seed-data`;

/**
 * Parse one `(...)` tuple of a MySQL INSERT into an array of JS values.
 * Handles `'…'` strings with `\'`, `''` and `\\` escapes, NULL, and numbers.
 *
 * @param {string} tuple text between the outer parentheses
 * @returns {(string | number | null)[]}
 */
function parseTuple(tuple) {
  /** @type {(string | number | null)[]} */
  const values = [];
  let i = 0;
  while (i < tuple.length) {
    while (i < tuple.length && /[\s,]/.test(tuple[i])) i += 1;
    if (i >= tuple.length) break;

    if (tuple[i] === "'") {
      i += 1;
      let out = '';
      while (i < tuple.length) {
        const ch = tuple[i];
        if (ch === '\\') {
          const next = tuple[i + 1];
          out += next === 'n' ? '\n' : next === 'r' ? '\r' : next === 't' ? '\t' : next;
          i += 2;
          continue;
        }
        if (ch === "'") {
          if (tuple[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        out += ch;
        i += 1;
      }
      values.push(out);
      continue;
    }

    let start = i;
    while (i < tuple.length && tuple[i] !== ',') i += 1;
    const raw = tuple.slice(start, i).trim();
    values.push(raw === 'NULL' ? null : Number(raw));
  }
  return values;
}

/**
 * Stream the dump and hand every tuple of the named tables to a collector.
 *
 * @param {string} file
 * @param {Record<string, (values: (string | number | null)[]) => void>} collectors
 */
async function readInserts(file, collectors) {
  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  /** @type {string | null} */
  let current = null;

  for await (const line of rl) {
    const header = /^INSERT INTO `([a-z_0-9]+)`/.exec(line);
    if (header) {
      current = collectors[header[1]] ? header[1] : null;
      continue;
    }
    if (!current) continue;
    if (!line.startsWith('(')) {
      // Anything that is not a value tuple ends the statement.
      if (line.trim() !== '') current = null;
      continue;
    }
    // `(1, 'a', …),` or `(1, 'a', …);`
    const end = line.lastIndexOf(')');
    collectors[current](parseTuple(line.slice(1, end)));
    if (line.trimEnd().endsWith(';')) current = null;
  }
}

/** @param {string | number | null} v */
const str = (v) => (v === null ? null : String(v));
/** @param {string | number | null} v */
const blankToNull = (v) => {
  const s = str(v);
  return s === null || s === '' || s === '0' ? null : s;
};

async function main() {
  /** @type {{id:number,parentId:number|null,level:number,code:string|null,name:string,mergerName:string|null,lng:string|null,lat:string|null,isVisible:boolean}[]} */
  const cities = [];
  /** @type {{id:number,code:string,name:string,sortOrder:number,isEnabled:boolean}[]} */
  const express = [];

  await readInserts(sqlPath, {
    // (id, city_id, level, parent_id, area_code, name, merger_name, lng, lat, is_show)
    eb_system_city(v) {
      cities.push({
        // The legacy tree links `parent_id -> city_id`, so `city_id` is the key
        // that makes it self-consistent. The dump's own `id` is discarded.
        id: Number(v[1]),
        parentId: Number(v[3]) === 0 ? null : Number(v[3]),
        level: Number(v[2]),
        code: blankToNull(v[4]),
        name: String(v[5]),
        mergerName: blankToNull(v[6]),
        lng: blankToNull(v[7]),
        lat: blankToNull(v[8]),
        isVisible: Number(v[9]) === 1,
      });
    },
    // (id, code, name, partner_id, partner_key, net, check_man, partner_name,
    //  is_code, courier_name, customer_name, code_name, account, key, net_name,
    //  sort, is_show, status)
    eb_express(v) {
      express.push({
        id: Number(v[0]),
        code: String(v[1]),
        name: String(v[2]),
        sortOrder: Number(v[15]),
        // `is_show` is what the admin picker filters on; `status` tracked the
        // retired CRMeb-cloud waybill subscription and is dropped.
        isEnabled: Number(v[16]) === 1,
      });
    },
  });

  // --- integrity checks: a silent duplicate here would break the seed --------
  const problems = [];
  const cityIds = new Set();
  for (const c of cities) {
    if (cityIds.has(c.id)) problems.push(`duplicate city id ${c.id} (${c.name})`);
    cityIds.add(c.id);
  }
  for (const c of cities) {
    if (c.parentId !== null && !cityIds.has(c.parentId)) {
      problems.push(`city ${c.id} (${c.name}) has unknown parent ${c.parentId}`);
    }
  }
  const codes = new Map();
  for (const c of cities) {
    if (c.code === null) continue;
    if (codes.has(c.code)) problems.push(`duplicate city code ${c.code}: ${codes.get(c.code)} and ${c.name}`);
    codes.set(c.code, c.name);
  }
  const expressCodes = new Set();
  for (const e of express) {
    if (expressCodes.has(e.code)) problems.push(`duplicate express code ${e.code}`);
    expressCodes.add(e.code);
  }

  // Parents must be inserted before children; the seed relies on this order.
  cities.sort((a, b) => a.level - b.level || a.id - b.id);
  express.sort((a, b) => a.id - b.id);

  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/cities.json`, `${JSON.stringify(cities, null, 0)}\n`);
  await writeFile(`${outDir}/express-companies.json`, `${JSON.stringify(express, null, 2)}\n`);

  const levels = [...new Set(cities.map((c) => c.level))].sort();
  process.stdout.write(
    `cities: ${cities.length} rows, levels ${levels.join('/')}\n` +
      `express-companies: ${express.length} rows\n`,
  );
  if (problems.length > 0) {
    process.stderr.write(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}\n`);
    process.exitCode = 1;
  }
}

await main();
