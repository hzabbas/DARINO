import assert from 'node:assert/strict';
import test from 'node:test';

import { backupToJson, restoreBackup } from '../src/db/backup.web';
import {
  createBankAccount,
  findAccountBySender,
  getBankAccount,
  updateBankAccount,
} from '../src/db/bankAccounts.web';
import {
  createCategory,
  deleteCategoryWithTransactions,
  deleteEmptyCategory,
  listCategories,
  moveTransactions,
} from '../src/db/categories.web';
import { resetWebStore } from '../src/db/store.web';
import { resetDbChangeListeners, subscribeDbChange } from '../src/db/events';
import { factoryReset, resetTransactionsAndBalances } from '../src/db/reset.web';
import {
  countPendingSms,
  clearPendingSmsQueue,
  insertPendingSms,
  mergePendingSmsWithTransaction,
} from '../src/db/pendingSms.web';
import {
  countTransactions,
  createTransaction,
  deleteTransaction,
  getCategoryTotals,
  getSummary,
  listTransactions,
} from '../src/db/transactions.web';
import type { SqlDatabase } from '../src/types/models';

/**
 * روی وب همه‌ی repositoryها دیتابیس را نادیده می‌گیرند و به store.web
 * وصل می‌شوند؛ پس یک آبجکت خالی به‌عنوان دیتابیس کافی است.
 */
const FAKE_DB = {} as SqlDatabase;

class FakeStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

const storage = new FakeStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const RANGE = { startIso: '2026-10-23T00:00:00', endIso: '2026-11-22T00:00:00' };

function categoryId(name: string): number {
  const category = listCategories(FAKE_DB).find((item) => item.name === name);
  assert.ok(category, `دسته‌بندی «${name}» پیدا نشد`);
  return category.id;
}

test('web store seeds the default categories and persists', () => {
  resetWebStore();
  storage.clear();

  const categories = listCategories(FAKE_DB);
  assert.equal(categories.length, 15);
  assert.equal(listCategories(FAKE_DB, 'expense').length, 12);
  assert.equal(listCategories(FAKE_DB, 'income').length, 3);

  createTransaction(FAKE_DB, {
    amount: 250000,
    type: 'expense',
    category_id: categoryId('بنزین و سوخت خودرو'),
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
    note: 'بنزین مسیر',
  });

  const stored = storage.getItem('darino.web.v1');
  assert.ok(stored, 'داده‌ها باید در localStorage ذخیره شوند');
  assert.ok(stored.includes('بنزین مسیر'));
  assert.equal(getSummary(FAKE_DB, null).expense, 250000);
});

test('web transactions filter by range and sort newest first', () => {
  resetWebStore();
  const fuelId = categoryId('بنزین و سوخت خودرو');

  const make = (amount: number, date: string) =>
    createTransaction(FAKE_DB, {
      amount,
      type: 'expense',
      category_id: fuelId,
      date,
      shamsi_date: '۱۴۰۵/۰۸/۱۸',
    });

  make(100000, '2026-11-01T10:00:00');
  make(200000, '2026-11-10T10:00:00');
  make(300000, '2026-09-01T10:00:00'); // بیرون از آبان

  const rows = listTransactions(FAKE_DB, RANGE);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amount, 200000);
  assert.equal(rows[1].amount, 100000);
  assert.equal(rows[0].category_name, 'بنزین و سوخت خودرو');

  assert.equal(listTransactions(FAKE_DB, null).length, 3);
  assert.equal(getSummary(FAKE_DB, RANGE).expense, 300000);
  assert.equal(getSummary(FAKE_DB, null).expense, 600000);
});

test('web category totals are grouped by type and sorted', () => {
  resetWebStore();
  const fuelId = categoryId('بنزین و سوخت خودرو');
  const foodId = categoryId('خوراک و مواد غذایی');
  const salaryId = categoryId('حقوق و درآمد ماهانه');

  createTransaction(FAKE_DB, {
    amount: 10000000,
    type: 'income',
    category_id: salaryId,
    date: '2026-11-01T09:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۰',
  });
  createTransaction(FAKE_DB, {
    amount: 250000,
    type: 'expense',
    category_id: fuelId,
    date: '2026-11-02T09:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۱',
  });
  for (const date of ['2026-11-03T09:00:00', '2026-11-04T09:00:00']) {
    createTransaction(FAKE_DB, {
      amount: 500000,
      type: 'expense',
      category_id: foodId,
      date,
      shamsi_date: '۱۴۰۵/۰۸/۱۲',
    });
  }

  const expenses = getCategoryTotals(FAKE_DB, RANGE, 'expense');
  assert.equal(expenses.length, 2);
  assert.equal(expenses[0].name, 'خوراک و مواد غذایی');
  assert.equal(expenses[0].total, 1000000);
  assert.equal(expenses[0].count, 2);

  const incomes = getCategoryTotals(FAKE_DB, RANGE, 'income');
  assert.equal(incomes.length, 1);
  assert.equal(incomes[0].total, 10000000);
});

test('web categories can be moved and deleted safely', () => {
  resetWebStore();
  const fuelId = categoryId('بنزین و سوخت خودرو');
  const washId = categoryId('کارواش');

  for (const date of ['2026-11-01T10:00:00', '2026-11-02T10:00:00']) {
    createTransaction(FAKE_DB, {
      amount: 100000,
      type: 'expense',
      category_id: fuelId,
      date,
      shamsi_date: '۱۴۰۵/۰۸/۱۸',
    });
  }

  assert.throws(() => deleteEmptyCategory(FAKE_DB, fuelId), /تراکنش/);

  assert.equal(moveTransactions(FAKE_DB, fuelId, washId), 2);
  deleteEmptyCategory(FAKE_DB, fuelId);
  assert.equal(listCategories(FAKE_DB).length, 14);
  assert.equal(listTransactions(FAKE_DB, null)[0].category_name, 'کارواش');

  assert.equal(deleteCategoryWithTransactions(FAKE_DB, washId), 2);
  assert.equal(countTransactions(FAKE_DB), 0);
});

test('web backup and restore round trip', () => {
  resetWebStore();
  const fuelId = categoryId('بنزین و سوخت خودرو');

  const transactionId = createTransaction(FAKE_DB, {
    amount: 250000,
    type: 'expense',
    category_id: fuelId,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
    note: 'پشتیبان',
  });

  const json = backupToJson(FAKE_DB);
  deleteTransaction(FAKE_DB, transactionId);
  assert.equal(countTransactions(FAKE_DB), 0);

  const result = restoreBackup(FAKE_DB, json);
  assert.equal(result.transactions, 1);
  assert.equal(result.categories, 15);
  assert.equal(countTransactions(FAKE_DB), 1);
  assert.equal(listTransactions(FAKE_DB, null)[0].note, 'پشتیبان');
});

test('web store rejects foreign backup files', () => {
  resetWebStore();
  assert.throws(() => restoreBackup(FAKE_DB, JSON.stringify({ app: 'other' })), /دارینو/);
  assert.equal(countTransactions(FAKE_DB), 0);
});

test('web category writes notify listeners too', () => {
  resetWebStore();
  resetDbChangeListeners();

  let notifications = 0;
  subscribeDbChange(() => {
    notifications += 1;
  });

  const fuelId = categoryId('بنزین و سوخت خودرو');
  const created = createCategory(FAKE_DB, {
    name: 'خرید کتاب',
    type: 'expense',
    icon: 'book-outline',
    color: '#7C3AED',
  });
  assert.equal(notifications, 1, 'ساخت دسته‌بندی در وب قبلاً اعلان نمی‌داد');

  const washId = categoryId('کارواش');
  createTransaction(FAKE_DB, {
    amount: 100000,
    type: 'expense',
    category_id: fuelId,
    date: '2026-11-01T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
  });
  assert.equal(moveTransactions(FAKE_DB, fuelId, washId), 1);
  assert.equal(notifications, 3, 'انتقال و ساخت تراکنش هم باید اعلان بدهند');

  deleteCategoryWithTransactions(FAKE_DB, created);
  assert.equal(notifications, 4);

  resetDbChangeListeners();
});

test('web bank accounts keep the balance unless it is edited on purpose', () => {
  resetWebStore();

  const id = createBankAccount(FAKE_DB, {
    bank_code: 'blu',
    title: 'بلوبانک',
    senders: ['09999987641'],
    initial_balance: 5_000_000,
  });
  assert.equal(getBankAccount(FAKE_DB, id)?.current_balance, 5_000_000);

  // تغییر نام و سرشماره‌ها نباید موجودی را عوض کند
  updateBankAccount(FAKE_DB, id, { title: 'بلوی من', senders: ['09999987641', 'B.BLU'] });
  assert.equal(getBankAccount(FAKE_DB, id)?.title, 'بلوی من');
  assert.equal(getBankAccount(FAKE_DB, id)?.current_balance, 5_000_000);

  // تغییر صریح موجودی فقط موجودی روز را عوض می‌کند
  updateBankAccount(FAKE_DB, id, { current_balance: 9_000_000 });
  assert.equal(getBankAccount(FAKE_DB, id)?.current_balance, 9_000_000);
  assert.equal(getBankAccount(FAKE_DB, id)?.initial_balance, 5_000_000);

  // سرشماره با هر پیشوندی همین حساب را پیدا می‌کند
  assert.equal(findAccountBySender(FAKE_DB, '+989999987641')?.id, id);
  assert.equal(findAccountBySender(FAKE_DB, '00989999987641')?.id, id);
});

test('web accounts get a sync boundary and a balance anchor', () => {
  resetWebStore();

  const now = Date.now();
  const id = createBankAccount(FAKE_DB, {
    bank_code: 'blu',
    title: 'بلوبانک',
    senders: ['09999987641'],
    current_balance: 4_130_000,
    sync_from_ts: now,
  });

  const created = getBankAccount(FAKE_DB, id);
  assert.ok(created);
  assert.equal(created.sync_from_ts, now, 'مرز همگام‌سازی همان مقدار درخواستی است');
  assert.ok(created.balance_anchor_ts > 0);

  // ویرایش موجودی، لنگر را جلو می‌برد؛ ویرایش نام این کار را نمی‌کند
  const anchor = created.balance_anchor_ts;
  updateBankAccount(FAKE_DB, id, { title: 'بلو' });
  assert.equal(getBankAccount(FAKE_DB, id)?.balance_anchor_ts, anchor);
  updateBankAccount(FAKE_DB, id, { current_balance: 100 });
  assert.ok((getBankAccount(FAKE_DB, id)?.balance_anchor_ts ?? 0) >= anchor);
  assert.equal(getBankAccount(FAKE_DB, id)?.current_balance, 100);
});

test('web reset clears what it promises and keeps the rest', () => {
  resetWebStore();

  const accountId = createBankAccount(FAKE_DB, {
    bank_code: 'blu',
    title: 'بلوبانک',
    senders: ['09999987641'],
    current_balance: 5_000_000,
  });
  createTransaction(FAKE_DB, {
    amount: 300_000,
    type: 'expense',
    category_id: categoryId('بنزین و سوخت خودرو'),
    date: '2026-11-13T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  insertPendingSms(FAKE_DB, {
    sms_id: 'web-queue-1',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'صف',
    detected_type: 'expense',
    amount: 5000,
    date: '2026-11-13T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  // پاک‌کردن صف، هیچ چیز دیگری را دست نمی‌زند
  assert.equal(clearPendingSmsQueue(FAKE_DB), 1);
  assert.equal(countPendingSms(FAKE_DB), 0);
  assert.equal(countTransactions(FAKE_DB), 1);

  const summary = resetTransactionsAndBalances(FAKE_DB);
  assert.equal(summary.transactions, 1);
  assert.equal(summary.accountsZeroed, 1);
  assert.equal(countTransactions(FAKE_DB), 0);
  assert.equal(getBankAccount(FAKE_DB, accountId)?.current_balance, 0);
  assert.ok(getBankAccount(FAKE_DB, accountId), 'تعریف حساب بانکی می‌ماند');
  assert.ok(listCategories(FAKE_DB).length > 0, 'دسته‌بندی‌ها می‌مانند');
});

test('web factory reset wipes everything and reseeds categories', () => {
  resetWebStore();

  createBankAccount(FAKE_DB, { bank_code: 'blu', title: 'بلوبانک', current_balance: 1_000_000 });
  createTransaction(FAKE_DB, {
    amount: 50_000,
    type: 'expense',
    category_id: categoryId('کارواش'),
    date: '2026-11-13T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  const summary = factoryReset(FAKE_DB);

  assert.equal(summary.transactions, 1);
  assert.equal(summary.accounts, 1);
  assert.ok(summary.seeded > 0, 'دسته‌بندی‌های پیش‌فرض دوباره ساخته می‌شوند');
  assert.equal(countTransactions(FAKE_DB), 0);
  assert.equal(listCategories(FAKE_DB).length, summary.seeded);
  assert.deepEqual(getSummary(FAKE_DB, RANGE), { income: 0, expense: 0, balance: 0 });
});

test('web merge links the existing transaction instead of duplicating it', () => {
  resetWebStore();

  const accountId = createBankAccount(FAKE_DB, {
    bank_code: 'blu',
    title: 'بلوبانک',
    senders: ['09999987641'],
    current_balance: 0,
    // آخرین مانده‌ی معلوم، صبح روز قبل است؛ مانده‌ی پیامک تازه‌تر است.
    balance_anchor_ts: new Date(2026, 10, 13, 8).getTime(),
  });
  const manualId = createTransaction(FAKE_DB, {
    amount: 570_000,
    type: 'expense',
    category_id: categoryId('کارواش'),
    date: '2026-11-13T09:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    note: 'اسنپ',
  });

  const { row } = insertPendingSms(FAKE_DB, {
    sms_id: 'web-merge-1',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'برداشت',
    detected_type: 'expense',
    amount: 570_000,
    detected_balance: 4_130_000,
    date: '2026-11-13T11:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    merchant: 'اسنپ',
  });
  assert.ok(row);

  const result = mergePendingSmsWithTransaction(FAKE_DB, {
    pendingId: row.id,
    transactionId: manualId,
  });

  assert.equal(result.merged, true);
  assert.equal(countTransactions(FAKE_DB), 1, 'تراکنش تکراری ساخته نمی‌شود');
  assert.equal(getBankAccount(FAKE_DB, accountId)?.current_balance, 4_130_000);
  assert.equal(listTransactions(FAKE_DB, RANGE, -1, { bankLink: 'linked' }).length, 1);
  assert.equal(listTransactions(FAKE_DB, RANGE, -1, { bankLink: 'manual' }).length, 0);
});
