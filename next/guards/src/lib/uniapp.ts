/**
 * Reading the uni-app sources.
 *
 * The storefront's API layer (`api/*.js`) is plain JavaScript: one function per
 * call the pages make, a URL and a mapper. Every `request.<verb>('…')` must
 * resolve to a contract.
 *
 * The rest of the app is read for two structural facts: which pages
 * `pages.json` registers, and which local modules each file imports — per
 * compilation target, because uni-app's `#ifdef` blocks mean the H5 and the
 * mini-program builds see different code.
 *
 * Everything here is pure, so it is unit-tested without the repository.
 */

export interface UniCall {
  file: string;
  line: number;
  method: string;
  url: string;
}

const CALL = /request\.(get|post|put|patch|delete)\(\s*(['"`])((?:\\.|(?!\2)[\s\S])*)\2/g;

/**
 * `/api/v1/orders/${id}/cancel` -> `/api/v1/orders/:param/cancel`.
 * Interpolations nest (`${(data || {}).id}`), so the braces are matched by hand.
 */
export function normaliseUrl(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '$' || raw[i + 1] !== '{') {
      out += raw[i];
      continue;
    }
    let depth = 0;
    let j = i + 1;
    for (; j < raw.length; j += 1) {
      if (raw[j] === '{') depth += 1;
      else if (raw[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out += ':param';
    i = j;
  }
  return out;
}

export function extractCalls(file: string, source: string): UniCall[] {
  const out: UniCall[] = [];
  CALL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CALL.exec(source)) !== null) {
    const line = source.slice(0, match.index).split('\n').length;
    out.push({
      file,
      line,
      method: (match[1] ?? '').toUpperCase(),
      url: normaliseUrl(match[3] ?? ''),
    });
  }
  return out;
}

/** The two targets the shop ships: the H5 site and the WeChat mini-program. */
export const TARGETS = ['H5', 'MP-WEIXIN'] as const;
export type Target = (typeof TARGETS)[number];

/** Is a conditional-compilation platform name on for this target? */
function platformOn(name: string, target: Target): boolean {
  return name === target || (name === 'MP' && target === 'MP-WEIXIN');
}

/** `H5 || MP-WEIXIN`, `APP-PLUS`, `!H5` … — no parentheses in this codebase. */
function evaluate(expression: string, target: Target): boolean {
  return expression.split('||').some((any) =>
    any.split('&&').every((term) => {
      const atom = term.trim();
      return atom.startsWith('!')
        ? !platformOn(atom.slice(1).trim(), target)
        : platformOn(atom, target);
    }),
  );
}

const CONDITION = /#(ifdef|ifndef)\s+([\w\s|&!-]+?)(?:\s*-->|\s*\*\/|\s*$)/;

/**
 * The source one target compiles: lines inside an `#ifdef` / `#ifndef` block
 * that is off for `target` are dropped, and so are the directive lines.
 */
export function preprocess(source: string, target: Target): string {
  const stack: Array<{ outer: boolean; on: boolean }> = [];
  let active = true;
  const kept: string[] = [];
  for (const line of source.split('\n')) {
    const open = CONDITION.exec(line);
    if (open) {
      let on = evaluate(open[2] ?? '', target);
      if (open[1] === 'ifndef') on = !on;
      stack.push({ outer: active, on });
      active = active && on;
      continue;
    }
    const top = stack.at(-1);
    if (/#else\b/.test(line) && top) {
      active = top.outer && !top.on;
      continue;
    }
    if (/#endif\b/.test(line) && top) {
      active = top.outer;
      stack.pop();
      continue;
    }
    if (active) kept.push(line);
  }
  return kept.join('\n');
}

/** The `<script>` blocks of a `.vue` file, or the whole of a `.js` one. */
export function scriptOf(file: string, source: string): string {
  if (!file.endsWith('.vue')) return source;
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1] ?? '')
    .join('\n');
}

const STATIC_FROM = /(?:^|[\n;])\s*(?:import|export)\s+[\w*${}\s,]+?\s+from\s*(['"])([^'"]+)\1/g;
const BARE_IMPORT = /(?:^|[\n;])\s*import\s*(['"])([^'"]+)\1/g;

/**
 * Every module specifier a static `import … from`, `export … from` or bare
 * `import '…'` names. Comments are removed first, so a commented-out import is
 * not an import.
 */
export function importsOf(script: string): string[] {
  const code = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  for (const pattern of [STATIC_FROM, BARE_IMPORT]) {
    pattern.lastIndex = 0;
    for (const match of code.matchAll(pattern)) out.push(match[2] ?? '');
  }
  return out;
}

/** A specifier this app resolves itself: relative, or `@/` from the app root. */
export function isLocal(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('@/');
}

/** What a local specifier may resolve to, in the order the bundler tries. */
export const RESOLVE_SUFFIXES = ['', '.js', '.vue', '.json', '/index.js', '/index.vue'];

/** The string elements of `export const <name> = [ … ]`, or null when there is no such list. */
export function exportedStringList(source: string, name: string): string[] | null {
  const block = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(source);
  if (!block) return null;
  return [...(block[1] ?? '').matchAll(/(['"])([^'"]*)\1/g)].map((m) => m[2] ?? '');
}
