import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countTransactionsForCategory,
  createCategory,
  deleteCategory,
  deleteCategoryWithTransactions,
  deleteEmptyCategory,
  getCategory,
  getCategoryUsageCounts,
  listCategories,
  moveTransactions,
  updateCategory,
} from '../src/db/categories';
import { migrate } from '../src/db/migrate';
import { resetDbChangeListeners, subscribeDbChange } from '../src/db/events';
import { DEFAULT_CATEGORIES, seedDefaultCategories } from '../src/db/seed';
import {
  countTransactions,
  countTransactionsInRange,
  createTransaction,
  deleteTransaction,
  getExpenseByCategory,
  getSummary,
  getTransactionWithCategory,
  listRecentTransactions,
  listTransactions,
  updateTransaction,
} from '../src/db/transactions';
import type { SqlDatabase } from '../src/types/models';
import { getJalaliMonthRange } from '../src/utils/jalali';
import { createNodeDatabase } from './helpers/nodeDatabase';

const RANGE = getJalaliMonthRange(new Date(2026, 10, 9)); // آبان ۱۴۰۵

function setup(): { db: SqlDatabase; seeded: number } {
  const db = createNodeDatabase();
  const { seeded } = migrate(db);
  return { db, seeded };
}

function findCategory(db: SqlDatabase, name: string) {
  const category = listCategories(db).find((item) => item.name === name);
  assert.ok(category, `دسته‌بندی «${name}» پیدا نشد`);
  return category;
}

test('migrate creates tables and seeds default categories once', () => {
  const { db, seeded } = setup();

  assert.equal(seeded, DEFAULT_CATEGORIES.length);
  assert.equal(listCategories(db).length, 15);
  assert.equal(listCategories(db, 'expense').length, 12);
  assert.equal(listCategories(db, 'income').length, 3);

  // اجرای دوباره‌ی seed و migrate نباید رکورد تکراری بسازد
  assert.equal(seedDefaultCategories(db), 0);
  migrate(db);
  assert.equal(listCategories(db).length, 15);
});

test('schema contains the required columns', () => {
  const { db } = setup();

  const categoryColumns = db
    .getAllSync<{ name: string }>('PRAGMA table_info(categories)')
    .map((column) => column.name);
  assert.deepEqual(categoryColumns, ['id', 'name', 'type', 'icon', 'color']);

  const transactionColumns = db
    .getAllSync<{ name: string }>('PRAGMA table_info(transactions)')
    .map((column) => column.name);
  assert.deepEqual(transactionColumns, [
    'id',
    'amount',
    'type',
    'category_id',
    'date',
    'shamsi_date',
    'note',
    'created_at',
    'bank_account_id',
  ]);
});

test('transactions are saved, trimmed and joined with their category', () => {
  const { db } = setup();
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');

  const id = createTransaction(db, {
    amount: 250000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
    note: '  بنزین مسیر کرمان  ',
  });

  assert.equal(id, 1);
  assert.equal(countTransactions(db), 1);

  const [row] = listRecentTransactions(db);
  assert.equal(row.amount, 250000);
  assert.equal(row.type, 'expense');
  assert.equal(row.note, 'بنزین مسیر کرمان');
  assert.equal(row.category_name, 'بنزین و سوخت خودرو');
  assert.equal(row.category_icon, 'speedometer-outline');
  assert.equal(row.shamsi_date, '۱۴۰۵/۰۸/۱۸');
});

test('invalid transactions are rejected', () => {
  const { db } = setup();
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');
  const base = {
    type: 'expense' as const,
    category_id: fuel.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
  };

  assert.throws(() => createTransaction(db, { ...base, amount: 0 }), /بزرگ‌تر از صفر/);
  assert.throws(() => createTransaction(db, { ...base, amount: -100 }), /بزرگ‌تر از صفر/);
  assert.throws(() => createTransaction(db, { ...base, amount: 1000, category_id: 0 }), /دسته‌بندی/);
  assert.equal(countTransactions(db), 0);
});

test('monthly summary only counts the requested range', () => {
  const { db } = setup();
  const salary = findCategory(db, 'حقوق و درآمد ماهانه');
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');
  const food = findCategory(db, 'خوراک و مواد غذایی');

  createTransaction(db, {
    amount: 10000000,
    type: 'income',
    category_id: salary.id,
    date: RANGE.startIso,
    shamsi_date: '۱۴۰۵/۰۸/۰۱',
  });
  createTransaction(db, {
    amount: 250000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-01T08:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۰',
  });
  createTransaction(db, {
    amount: 750000,
    type: 'expense',
    category_id: food.id,
    date: '2026-11-05T20:30:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۴',
  });
  // بیرون از بازه‌ی آبان ۱۴۰۵
  createTransaction(db, {
    amount: 999000,
    type: 'expense',
    category_id: food.id,
    date: '2026-09-01T12:00:00',
    shamsi_date: '۱۴۰۵/۰۶/۱۰',
  });

  const summary = getSummary(db, RANGE);
  assert.deepEqual(summary, { income: 10000000, expense: 1000000, balance: 9000000 });

  const inRange = listTransactions(db, RANGE);
  assert.equal(inRange.length, 3);

  const breakdown = getExpenseByCategory(db, RANGE);
  assert.equal(breakdown.length, 2);
  assert.equal(breakdown[0].name, 'خوراک و مواد غذایی');
  assert.equal(breakdown[0].total, 750000);
  assert.equal(breakdown[0].count, 1);
  assert.equal(breakdown[1].name, 'بنزین و سوخت خودرو');
});

test('category usage counts and deletion keep history', () => {
  const { db } = setup();
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');

  createTransaction(db, {
    amount: 250000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
  });
  createTransaction(db, {
    amount: 150000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-10T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۹',
  });

  assert.deepEqual(getCategoryUsageCounts(db), { [fuel.id]: 2 });

  deleteCategory(db, fuel.id);
  assert.equal(listCategories(db).length, 14);
  assert.equal(countTransactions(db), 2);

  const rows = listRecentTransactions(db);
  assert.equal(rows[0].category_id, null);
  assert.equal(rows[0].category_name, null);
});

test('custom categories and transaction deletion work', () => {
  const { db } = setup();

  const id = createCategory(db, {
    name: 'خرید کتاب',
    type: 'expense',
    icon: 'book-outline',
    color: '#7C3AED',
  });
  assert.ok(id > 0);

  const transactionId = createTransaction(db, {
    amount: 320000,
    type: 'expense',
    category_id: id,
    date: '2026-11-11T18:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۲۰',
  });

  assert.equal(listRecentTransactions(db).length, 1);
  deleteTransaction(db, transactionId);
  assert.equal(listRecentTransactions(db).length, 0);
});

test('range boundaries are half-open', () => {
  const { db } = setup();
  const food = findCategory(db, 'خوراک و مواد غذایی');

  const make = (date: string) =>
    createTransaction(db, {
      amount: 1000,
      type: 'expense',
      category_id: food.id,
      date,
      shamsi_date: '۱۴۰۵/۰۸/۰۱',
    });

  make(RANGE.startIso); // اولین لحظه‌ی ماه، شامل
  make('2026-11-21T23:59:59'); // آخرین لحظه‌ی ماه، شامل
  make(RANGE.endIso); // اولین لحظه‌ی ماه بعد، خارج
  make('2026-10-22T23:59:59'); // آخرین لحظه‌ی ماه قبل، خارج

  assert.equal(listTransactions(db, RANGE).length, 2);
  assert.equal(countTransactionsInRange(db, RANGE), 2);
  assert.equal(getSummary(db, RANGE).expense, 2000);

  // بدون فیلتر (کل زمان‌ها) همه‌ی رکوردها برمی‌گردند
  assert.equal(listTransactions(db, null).length, 4);
  assert.equal(getSummary(db, null).expense, 4000);
});

test('editing a transaction keeps its date and updates totals', () => {
  const { db } = setup();
  const salary = findCategory(db, 'حقوق و درآمد ماهانه');
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');

  const id = createTransaction(db, {
    amount: 5000000,
    type: 'income',
    category_id: salary.id,
    date: '2026-11-02T09:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۱',
    note: 'حقوق',
  });

  const before = getTransactionWithCategory(db, id);
  assert.ok(before);

  updateTransaction(db, id, {
    amount: 6500000,
    type: 'income',
    category_id: salary.id,
    date: before.date,
    shamsi_date: before.shamsi_date,
    note: 'حقوق آبان',
  });

  const after = getTransactionWithCategory(db, id);
  assert.ok(after);
  assert.equal(after.amount, 6500000);
  assert.equal(after.note, 'حقوق آبان');
  assert.equal(after.date, '2026-11-02T09:00:00');
  assert.equal(getSummary(db, RANGE).income, 6500000);
  assert.equal(countTransactions(db), 1);

  // تغییر نوع و دسته هم باید ممکن باشد
  updateTransaction(db, id, {
    amount: 200000,
    type: 'expense',
    category_id: fuel.id,
    date: after.date,
    shamsi_date: after.shamsi_date,
    note: null,
  });

  const changed = getTransactionWithCategory(db, id);
  assert.equal(changed?.type, 'expense');
  assert.equal(changed?.category_name, 'بنزین و سوخت خودرو');
  assert.equal(changed?.note, null);
  assert.equal(getSummary(db, RANGE).balance, -200000);
});

test('renaming a category updates previous transactions', () => {
  const { db } = setup();
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');

  createTransaction(db, {
    amount: 250000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
  });

  updateCategory(db, fuel.id, {
    name: 'سوخت خودرو',
    type: 'expense',
    icon: 'flame-outline',
    color: '#F97316',
  });

  const [row] = listTransactions(db, null);
  assert.equal(row.category_name, 'سوخت خودرو');
  assert.equal(row.category_icon, 'flame-outline');
  assert.equal(row.category_color, '#F97316');

  const stored = getCategory(db, fuel.id);
  assert.equal(stored?.name, 'سوخت خودرو');
  assert.equal(stored?.type, 'expense');
});

test('a category with transactions can not be deleted as empty', () => {
  const { db } = setup();
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');

  createTransaction(db, {
    amount: 250000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
  });

  assert.equal(countTransactionsForCategory(db, fuel.id), 1);
  assert.throws(() => deleteEmptyCategory(db, fuel.id), /تراکنش/);
  assert.ok(getCategory(db, fuel.id));
  assert.equal(countTransactions(db), 1);
});

test('category writes notify listeners so every screen refreshes', () => {
  const { db } = setup();

  let notifications = 0;
  resetDbChangeListeners();
  subscribeDbChange(() => {
    notifications += 1;
  });

  const id = createCategory(db, {
    name: 'خرید کتاب',
    type: 'expense',
    icon: 'book-outline',
    color: '#7C3AED',
  });
  assert.equal(notifications, 1, 'ساخت دسته‌بندی قبلاً اعلان نمی‌داد (return قبل از notify)');

  updateCategory(db, id, {
    name: 'کتاب و مجله',
    type: 'expense',
    icon: 'book-outline',
    color: '#7C3AED',
  });
  assert.equal(notifications, 2);

  resetDbChangeListeners();
});

test('transactions move between same-type categories before deleting', () => {
  const { db } = setup();
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');
  const wash = findCategory(db, 'کارواش');
  const salary = findCategory(db, 'حقوق و درآمد ماهانه');

  for (const date of ['2026-11-09T10:00:00', '2026-11-10T10:00:00']) {
    createTransaction(db, {
      amount: 250000,
      type: 'expense',
      category_id: fuel.id,
      date,
      shamsi_date: '۱۴۰۵/۰۸/۱۸',
    });
  }
  createTransaction(db, {
    amount: 9000000,
    type: 'income',
    category_id: salary.id,
    date: '2026-11-01T09:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۰',
  });

  assert.throws(() => moveTransactions(db, fuel.id, salary.id), /هم‌نوع/);
  assert.throws(() => moveTransactions(db, fuel.id, fuel.id), /یکسان/);

  assert.equal(moveTransactions(db, fuel.id, wash.id), 2);
  deleteEmptyCategory(db, fuel.id);

  assert.equal(getCategory(db, fuel.id), null);
  assert.equal(countTransactions(db), 3);
  assert.equal(getCategoryUsageCounts(db)[wash.id], 2);

  const movedRows = listTransactions(db, null).filter((row) => row.category_name === 'کارواش');
  assert.equal(movedRows.length, 2);
  assert.equal(getSummary(db, RANGE).expense, 500000);
});

test('deleting a category with its transactions removes both', () => {
  const { db } = setup();
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');
  const food = findCategory(db, 'خوراک و مواد غذایی');

  for (const date of ['2026-11-09T10:00:00', '2026-11-10T10:00:00']) {
    createTransaction(db, {
      amount: 100000,
      type: 'expense',
      category_id: fuel.id,
      date,
      shamsi_date: '۱۴۰۵/۰۸/۱۸',
    });
  }
  createTransaction(db, {
    amount: 300000,
    type: 'expense',
    category_id: food.id,
    date: '2026-11-11T12:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۲۰',
  });

  assert.equal(deleteCategoryWithTransactions(db, fuel.id), 2);
  assert.equal(getCategory(db, fuel.id), null);
  assert.equal(countTransactions(db), 1);

  const remaining = listTransactions(db, null);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].category_name, 'خوراک و مواد غذایی');
});
