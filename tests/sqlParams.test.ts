import assert from 'node:assert/strict';
import test from 'node:test';

import { migrate } from '../src/db/migrate';
import { sanitizeSqlParam, sanitizeSqlParams } from '../src/db/sqlParams';
import { createTransaction } from '../src/db/transactions';
import { listCategories } from '../src/db/categories';
import type { SqlDatabase } from '../src/types/models';
import { toLocalIso } from '../src/utils/jalali';
import { createNodeDatabase } from './helpers/nodeDatabase';

test('undefined and NaN are never handed to the sqlite driver', () => {
  // expo-sqlite با undefined/NaN خطای HostFunction می‌دهد که در JS قابل گرفتن نیست
  assert.equal(sanitizeSqlParam(undefined), null);
  assert.equal(sanitizeSqlParam(null), null);
  assert.equal(sanitizeSqlParam(Number.NaN), 0);
  assert.equal(sanitizeSqlParam(Number.POSITIVE_INFINITY), 0);
  assert.equal(sanitizeSqlParam(Number.NEGATIVE_INFINITY), 0);
  assert.equal(sanitizeSqlParam(0), 0);
  assert.equal(sanitizeSqlParam(12.5), 12.5);
  assert.equal(sanitizeSqlParam('متن'), 'متن');
  assert.equal(sanitizeSqlParam(true), 1);
  assert.equal(sanitizeSqlParam(false), 0);

  assert.deepEqual(sanitizeSqlParams([undefined, 1, Number.NaN, 'a', null, true]), [
    null,
    1,
    0,
    'a',
    null,
    1,
  ]);
});

test('optional transaction fields can be omitted without breaking the write', () => {
  const db: SqlDatabase = createNodeDatabase();
  migrate(db);
  const categoryId = listCategories(db, 'expense')[0].id;

  // note و bank_account_id اصلاً فرستاده نمی‌شوند (undefined در ورودی)
  const id = createTransaction(db, {
    amount: 150_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  const row = db.getFirstSync<{ note: string | null; bank_account_id: number | null }>(
    'SELECT note, bank_account_id FROM transactions WHERE id = ?',
    id,
  );
  assert.ok(row);
  assert.equal(row.note, null, 'توضیح خالی به NULL تبدیل می‌شود، نه undefined');
  assert.equal(row.bank_account_id, null, 'تراکنش بدون حساب، NULL می‌گیرد');
});

test('the driver wrapper sanitizes before binding (shape of the contract)', () => {
  // همان کاری که client.ts با پارامترهای هر کوئری می‌کند
  const params = sanitizeSqlParams([undefined, 'x', Number.NaN]);
  for (const value of params) {
    assert.notEqual(value, undefined, 'هیچ پارامتری undefined نمی‌ماند');
    if (typeof value === 'number') assert.ok(Number.isFinite(value), 'اعداد متناهی‌اند');
    assert.ok(['string', 'number', 'object'].includes(typeof value), 'نوع مجاز SQLite');
  }
});
