import assert from 'node:assert/strict';
import test from 'node:test';

import { listCategories } from '../src/db/categories';
import { resetDbChangeListeners, subscribeDbChange } from '../src/db/events';
import { migrate } from '../src/db/migrate';
import { isInsideTransaction, runInTransaction } from '../src/db/transaction';
import { createTransaction, deleteTransaction, listTransactions } from '../src/db/transactions';
import type { SqlDatabase } from '../src/types/models';
import { createNodeDatabase } from './helpers/nodeDatabase';

/** دیتابیسی که تعداد BEGIN/COMMIT را می‌شمارد تا تراکنش تودرتو لو برود. */
function createCountingDatabase(): {
  db: SqlDatabase;
  counts: { begin: number; commit: number };
} {
  const db = createNodeDatabase();
  const counts = { begin: 0, commit: 0 };

  return {
    db: {
      ...db,
      withTransactionSync(task: () => void) {
        counts.begin += 1;
        db.execSync('BEGIN');
        try {
          task();
          db.execSync('COMMIT');
          counts.commit += 1;
        } catch (error) {
          db.execSync('ROLLBACK');
          throw error;
        }
      },
    },
    counts,
  };
}

function newTransactionInput(db: SqlDatabase) {
  const category = listCategories(db, 'expense')[0];
  return {
    amount: 250_000,
    type: 'expense' as const,
    category_id: category.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
  };
}

test('a nested write reuses the outer transaction instead of opening a second one', () => {
  const { db, counts } = createCountingDatabase();
  // seed اولیه‌ی دیتابیس هم خودش یک تراکنش دارد؛ فقط بعد از آن را می‌شماریم
  migrate(db);
  counts.begin = 0;
  counts.commit = 0;

  // همان مسیری که «تایید پیامک» می‌رود: تراکنش بیرونی، بعد ثبت تراکنش
  runInTransaction(db, () => {
    assert.equal(isInsideTransaction(db), true, 'داخل تراکنش باید شناسایی شود');
    createTransaction(db, newTransactionInput(db));
  });

  assert.equal(counts.begin, 1, 'BEGIN دوم نباید اجرا شود (expo-sqlite تراکنش تودرتو ندارد)');
  assert.equal(counts.commit, 1);
  assert.equal(isInsideTransaction(db), false);
  assert.equal(listTransactions(db, null).length, 1);
});

test('transaction writes always notify listeners after the commit', () => {
  const { db } = createCountingDatabase();
  migrate(db);

  let notifications = 0;
  resetDbChangeListeners();
  const unsubscribe = subscribeDbChange(() => {
    notifications += 1;
  });

  const id = createTransaction(db, newTransactionInput(db));
  assert.equal(notifications, 1, 'ثبت تراکنش قبلاً اعلان نمی‌داد (return قبل از notify)');

  deleteTransaction(db, id);
  assert.equal(notifications, 2);

  unsubscribe();
  resetDbChangeListeners();
});

test('a failing transaction rolls back and leaves no transaction open', () => {
  const { db, counts } = createCountingDatabase();

  assert.throws(() => {
    runInTransaction(db, () => {
      db.execSync('CREATE TABLE probe (id INTEGER)');
      throw new Error('boom');
    });
  }, /boom/);

  assert.equal(counts.begin, 1);
  assert.equal(counts.commit, 0);
  assert.equal(isInsideTransaction(db), false);

  const tables = db
    .getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
    .map((row) => row.name);
  assert.equal(tables.includes('probe'), false, 'بعد از rollback جدول نباید بماند');
});
