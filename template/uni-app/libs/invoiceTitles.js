// 发票抬头 — a local address book.
//
// Legacy had ten `UserInvoiceController` routes behind 抬头管理. Stream B2 did not port
// them (`next/packages/contracts/src/order/order.invoice.contract.ts`): the header is
// frozen onto the invoice request at the moment it is made, which is the only thing that
// ever mattered, "and the storefront can remember the last one locally".
//
// So this is that local memory. It keeps the legacy row shape (`header_type` 1 个人 /
// 2 企业, `type` 1 普通 / 2 专用) because the 抬头管理 pages and the picker component are
// written against it, and `api/user.js` wraps it in the usual `{data, msg, status}`
// envelope so no call site can tell the difference.
//
// It is per-device and per-install, like any other draft the app remembers. Nothing here
// is authoritative: the invoice that gets issued is the one frozen on the request.

const KEY = 'invoice_titles';

/** Swappable so the unit tests (and a future migration) can drive it without `uni`. */
let storage = {
  get(key) {
    try {
      return uni.getStorageSync(key);
    } catch (e) {
      return '';
    }
  },
  set(key, value) {
    try {
      uni.setStorageSync(key, value);
    } catch (e) {
      /* a full or disabled storage must not break 开票 */
    }
  },
};

/** Test seam. Pass `null` to restore the `uni` adapter. */
export function setInvoiceStorage(adapter) {
  if (adapter) storage = adapter;
}

function read() {
  const raw = storage.get(KEY);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.slice();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function write(rows) {
  storage.set(KEY, JSON.stringify(rows));
  return rows;
}

/** Ids are local and never leave the device, so a timestamp is enough. */
function nextId(rows) {
  let max = 0;
  for (const row of rows) {
    const n = Number(row && row.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

/** Normalise whatever the form posted into the row shape the pages read back. */
export function normaliseTitle(data, id) {
  const src = data || {};
  return {
    id: String(id),
    name: String(src.name || ''),
    header_type: Number(src.header_type) === 2 ? 2 : 1,
    type: Number(src.type) === 2 ? 2 : 1,
    duty_number: String(src.duty_number || ''),
    drawer_phone: String(src.drawer_phone || ''),
    email: String(src.email || ''),
    tell: String(src.tell || ''),
    address: String(src.address || ''),
    bank: String(src.bank || ''),
    card_number: String(src.card_number || ''),
    is_default: src.is_default ? 1 : 0,
  };
}

export function listTitles() {
  return read();
}

export function findTitle(id) {
  const wanted = String(id);
  return read().find((row) => String(row.id) === wanted) || null;
}

export function saveTitle(data) {
  const rows = read();
  const src = data || {};
  const row = normaliseTitle(src, src.id ? src.id : nextId(rows));
  const at = rows.findIndex((r) => String(r.id) === row.id);
  if (at === -1) rows.push(row);
  else rows[at] = row;
  if (row.is_default) {
    for (const r of rows) if (String(r.id) !== row.id) r.is_default = 0;
  }
  write(rows);
  return row;
}

export function deleteTitle(id) {
  const wanted = String(id);
  const rows = read().filter((row) => String(row.id) !== wanted);
  write(rows);
  return rows;
}
