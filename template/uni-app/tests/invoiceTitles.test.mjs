import {
  setInvoiceStorage,
  normaliseTitle,
  listTitles,
  findTitle,
  saveTitle,
  deleteTitle,
} from '../libs/invoiceTitles.js';

/** A stand-in for `uni.getStorageSync` / `setStorageSync`. */
function memory(initial) {
  const cells = Object.assign({}, initial);
  return {
    get: (key) => (key in cells ? cells[key] : ''),
    set: (key, value) => {
      cells[key] = value;
    },
    cells,
  };
}

beforeEach(() => setInvoiceStorage(memory()));

describe('normaliseTitle', () => {
  it('coerces the form fields into the row shape the pages read back', () => {
    expect(normaliseTitle({ name: '某某公司', header_type: '2', type: '2' }, 7)).toEqual({
      id: '7',
      name: '某某公司',
      header_type: 2,
      type: 2,
      duty_number: '',
      drawer_phone: '',
      email: '',
      tell: '',
      address: '',
      bank: '',
      card_number: '',
      is_default: 0,
    });
  });

  it('falls back to 个人普通发票 for anything it cannot read', () => {
    expect(normaliseTitle(null, 1)).toMatchObject({ header_type: 1, type: 1, name: '' });
  });
});

describe('the address book', () => {
  it('starts empty and stays empty when storage answers nothing', () => {
    expect(listTitles()).toEqual([]);
    expect(findTitle('1')).toBe(null);
  });

  it('saves, lists and finds', () => {
    const row = saveTitle({ name: '张三', header_type: 1 });
    expect(row.id).toBe('1');
    expect(listTitles()).toHaveLength(1);
    expect(findTitle('1')).toMatchObject({ name: '张三' });
    // Ids are looked up as strings and as numbers, because the picker stringifies them.
    expect(findTitle(1)).toMatchObject({ name: '张三' });
  });

  it('gives each new row the next id', () => {
    saveTitle({ name: 'a' });
    saveTitle({ name: 'b' });
    expect(listTitles().map((r) => r.id)).toEqual(['1', '2']);
  });

  it('updates in place when the form carries an id', () => {
    saveTitle({ name: 'a' });
    saveTitle({ id: '1', name: 'a2', email: 'a@example.com' });
    expect(listTitles()).toHaveLength(1);
    expect(findTitle('1')).toMatchObject({ name: 'a2', email: 'a@example.com' });
  });

  it('keeps 默认 exclusive', () => {
    saveTitle({ name: 'a', is_default: 1 });
    saveTitle({ name: 'b', is_default: 1 });
    expect(listTitles().map((r) => r.is_default)).toEqual([0, 1]);
  });

  it('deletes', () => {
    saveTitle({ name: 'a' });
    saveTitle({ name: 'b' });
    expect(deleteTitle('1')).toHaveLength(1);
    expect(listTitles().map((r) => r.name)).toEqual(['b']);
    // Deleting something that is not there is not an error.
    expect(deleteTitle('99')).toHaveLength(1);
  });

  it('persists as JSON, so a fresh read of the same storage sees the same rows', () => {
    const store = memory();
    setInvoiceStorage(store);
    saveTitle({ name: '张三' });
    expect(typeof store.cells.invoice_titles).toBe('string');
    setInvoiceStorage(memory(store.cells));
    expect(listTitles()).toHaveLength(1);
  });

  it('shrugs off a corrupted cell instead of breaking 开票', () => {
    setInvoiceStorage(memory({ invoice_titles: '{not json' }));
    expect(listTitles()).toEqual([]);
    expect(saveTitle({ name: 'a' }).id).toBe('1');
  });

  it('accepts a cell an older build stored as an array rather than a string', () => {
    setInvoiceStorage(memory({ invoice_titles: [{ id: '4', name: 'old' }] }));
    expect(listTitles()).toHaveLength(1);
    expect(saveTitle({ name: 'new' }).id).toBe('5');
  });
});
