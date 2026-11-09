import assert from 'node:assert/strict';
import test from 'node:test';

import {
  backupToJson,
  buildBackupFileName,
  createBackup,
  parseBackup,
  restoreBackup,
} from '../src/db/backup';
import { listCategories, updateCategory } from '../src/db/categories';
import { migrate } from '../src/db/migrate';
import {
  countTransactions,
  createTransaction,
  listTransactions,
} from '../src/db/transactions';
import type { SqlDatabase } from '../src/types/models';
import { createNodeDatabase } from './helpers/nodeDatabase';

function setup(): SqlDatabase {
  const db = createNodeDatabase();
  migrate(db);
  return db;
}

function findCategory(db: SqlDatabase, name: string) {
  const category = listCategories(db).find((item) => item.name === name);
  assert.ok(category, `دسته‌بندی «${name}» پیدا نشد`);
  return category;
}

test('backup and restore keeps categories and transactions', () => {
  const source = setup();
  const fuel = findCategory(source, 'بنزین و سوخت خودرو');

  updateCategory(source, fuel.id, {
    name: 'سوخت خودرو',
    type: 'expense',
    icon: 'flame-outline',
    color: '#F97316',
  });

  const transactionId = createTransaction(source, {
    amount: 250000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
    note: 'بنزین مسیر',
  });

  const backup = createBackup(source);
  assert.equal(backup.app, 'darino');
  assert.equal(backup.categories.length, 15);
  assert.equal(backup.transactions.length, 1);

  const json = backupToJson(source);

  // دیتابیس مقصد: داده‌ی اضافی دارد و باید جایگزین شود
  const target = setup();
  const food = findCategory(target, 'خوراک و مواد غذایی');
  createTransaction(target, {
    amount: 999000,
    type: 'expense',
    category_id: food.id,
    date: '2026-10-01T10:00:00',
    shamsi_date: '۱۴۰۵/۰۷/۰۹',
  });
  assert.equal(countTransactions(target), 1);

  const result = restoreBackup(target, json);
  assert.deepEqual(result, { categories: 15, transactions: 1 });

  assert.equal(listCategories(target).length, 15);
  assert.equal(countTransactions(target), 1);

  const [row] = listTransactions(target, null);
  assert.equal(row.id, transactionId);
  assert.equal(row.amount, 250000);
  assert.equal(row.note, 'بنزین مسیر');
  assert.equal(row.category_name, 'سوخت خودرو');
  assert.equal(row.category_icon, 'flame-outline');
});

test('restored data can still be extended', () => {
  const source = setup();
  const fuel = findCategory(source, 'بنزین و سوخت خودرو');
  createTransaction(source, {
    amount: 250000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
  });

  const target = setup();
  restoreBackup(target, backupToJson(source));

  const food = findCategory(target, 'خوراک و مواد غذایی');
  createTransaction(target, {
    amount: 120000,
    type: 'expense',
    category_id: food.id,
    date: '2026-11-10T12:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۹',
  });

  assert.equal(countTransactions(target), 2);
});

test('broken or foreign backups are rejected with persian errors', () => {
  assert.throws(() => parseBackup('{ not json'), /JSON/);
  assert.throws(
    () => parseBackup(JSON.stringify({ app: 'other', version: 1, categories: [], transactions: [] })),
    /دارینو/,
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ app: 'darino', version: 9, categories: [], transactions: [] })),
    /نسخه/,
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ app: 'darino', version: 1, categories: {}, transactions: [] })),
    /دسته‌بندی/,
  );
});

test('invalid records are reported before touching the database', () => {
  const badTransaction = {
    app: 'darino',
    version: 1,
    exported_at: '',
    categories: [],
    transactions: [
      {
        id: 1,
        amount: 1000,
        type: 'expense',
        category_id: 7,
        date: '2026-11-09T10:00:00',
        shamsi_date: '۱۴۰۵/۰۸/۱۸',
        note: null,
        created_at: '',
      },
    ],
  };
  assert.throws(() => parseBackup(JSON.stringify(badTransaction)), /دسته‌بندی مرتبط/);

  const zeroAmount = {
    ...badTransaction,
    transactions: [{ ...badTransaction.transactions[0], category_id: null, amount: 0 }],
  };
  assert.throws(() => parseBackup(JSON.stringify(zeroAmount)), /مبلغ/);

  const duplicateCategories = {
    app: 'darino',
    version: 1,
    categories: [
      { id: 1, name: 'اول', type: 'expense', icon: 'cart-outline', color: '#EF4444' },
      { id: 1, name: 'دوم', type: 'expense', icon: 'cart-outline', color: '#EF4444' },
    ],
    transactions: [],
  };
  assert.throws(() => parseBackup(JSON.stringify(duplicateCategories)), /تکراری/);

  // دیتابیس دست‌نخورده می‌ماند
  const db = setup();
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');
  createTransaction(db, {
    amount: 1000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
  });
  assert.throws(() => restoreBackup(db, JSON.stringify(badTransaction)));
  assert.equal(countTransactions(db), 1);
});

test('backup file name carries the jalali date', () => {
  assert.equal(
    buildBackupFileName(new Date(2026, 10, 9, 14, 30)),
    'darino-backup-1405-08-18-1430.json',
  );
});
