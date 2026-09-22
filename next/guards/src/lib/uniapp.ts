/**
 * Reading `template/uni-app/api/*.js`.
 *
 * The storefront's API layer is plain JavaScript: one function per legacy
 * export, a URL and a mapper. Every `request.<verb>('…')` either resolves to a
 * contract or carries a `// CONTRACT-PENDING(<stream>)` marker above it.
 *
 * These helpers are pure so the marker algebra — which is the only subtle part —
 * can be unit-tested without the repository.
 */

export interface UniCall {
  file: string;
  line: number;
  method: string;
  url: string;
  /** Stream named by the marker covering this line, if any. */
  pending: string | null;
}

const CALL = /request\.(get|post|put|patch|delete)\(\s*(['"`])((?:\\.|(?!\2)[\s\S])*)\2/g;
const MARKER = /CONTRACT-PENDING\(([^)]+)\)/;
const DIVIDER = /^\s*\/\/\s*-{10,}\s*$/;
const COMMENT = /^\s*\/\//;

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

/**
 * Which stream's marker is in force on each line.
 *
 * A marker covers every call below it until a `// ------` section divider that
 * is not part of the marker's own comment block, or until the next marker. The
 * unit is the comment **block**, not the line: a marker's explanation often runs
 * for several lines and is closed by the divider underneath it, and that divider
 * must not cancel the marker that introduced it.
 */
export function pendingByLine(lines: readonly string[]): Array<string | null> {
  const active: Array<string | null> = new Array(lines.length).fill(null);
  let current: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!COMMENT.test(line)) {
      active[i] = current;
      i += 1;
      continue;
    }
    let end = i;
    let marker: string | null = null;
    let divider = false;
    while (end < lines.length && COMMENT.test(lines[end] ?? '')) {
      const found = MARKER.exec(lines[end] ?? '');
      if (found) marker = found[1] ?? null;
      else if (DIVIDER.test(lines[end] ?? '')) divider = true;
      end += 1;
    }
    if (marker) current = marker;
    else if (divider) current = null;
    for (; i < end; i += 1) active[i] = current;
  }
  return active;
}

export function extractCalls(file: string, source: string): UniCall[] {
  const lines = source.split('\n');
  const active = pendingByLine(lines);
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
      pending: active[line - 1] ?? null,
    });
  }
  return out;
}
