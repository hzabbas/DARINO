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
  deleteCategoryWithTransactions,
  deleteEmptyCategory,
  listCategories,
  moveTransactions,
} from '../src/db/categories.web';
import { resetWebStore } from '../src/db/store.web';
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
