import assert from 'node:assert/strict';
import test from 'node:test';

import { listCategories } from '../src/db/categories';
import { migrate } from '../src/db/migrate';
import { createTransaction, getCategoryTotals, getSummary, listTransactions } from '../src/db/transactions';
import type { SqlDatabase } from '../src/types/models';
import { getReportBounds, getReportCaption } from '../src/utils/reportRange';
import { matchesTransactionQuery, normalizeSearchQuery } from '../src/utils/transactionSearch';
import { createNodeDatabase } from './helpers/nodeDatabase';

const MONDAY = new Date(2026, 10, 9, 15, 30); // دوشنبه ۱۸ آبان ۱۴۰۵

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

test('report ranges cover today, week, month and a custom month', () => {
  assert.deepEqual(getReportBounds({ kind: 'today' }, MONDAY), {
    startIso: '2026-11-09T00:00:00',
    endIso: '2026-11-10T00:00:00',
  });

  assert.deepEqual(getReportBounds({ kind: 'week' }, MONDAY), {
    startIso: '2026-11-07T00:00:00',
    endIso: '2026-11-14T00:00:00',
  });

  assert.deepEqual(getReportBounds({ kind: 'month' }, MONDAY), {
    startIso: '2026-10-23T00:00:00',
    endIso: '2026-11-22T00:00:00',
  });

  // مهر ۱۴۰۵: ۲۳ شهریور تا ۲۲ مهر
  assert.deepEqual(getReportBounds({ kind: 'custom-month', jy: 1405, jm: 7 }, MONDAY), {
    startIso: '2026-09-23T00:00:00',
    endIso: '2026-10-23T00:00:00',
  });
});

test('report captions use jalali labels', () => {
  assert.equal(getReportCaption({ kind: 'today' }, MONDAY), 'دوشنبه، ۱۸ آبان ۱۴۰۵');
  assert.equal(getReportCaption({ kind: 'week' }, MONDAY), '۱۶ تا ۲۲ آبان');
  assert.equal(getReportCaption({ kind: 'month' }, MONDAY), 'آبان ۱۴۰۵');
  assert.equal(getReportCaption({ kind: 'custom-month', jy: 1405, jm: 7 }, MONDAY), 'مهر ۱۴۰۵');
});

test('category totals are split by type and sorted by amount', () => {
  const db = setup();
  const range = getReportBounds({ kind: 'month' }, MONDAY);

  const salary = findCategory(db, 'حقوق و درآمد ماهانه');
  const snap = findCategory(db, 'فعالیت در اسنپ (مسافرکشی روزانه)');
  const fuel = findCategory(db, 'بنزین و سوخت خودرو');
  const food = findCategory(db, 'خوراک و مواد غذایی');

  createTransaction(db, {
    amount: 10000000,
    type: 'income',
    category_id: salary.id,
    date: '2026-11-01T09:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۰',
  });
  for (const date of ['2026-11-02T18:00:00', '2026-11-03T18:00:00']) {
    createTransaction(db, {
      amount: 2000000,
      type: 'income',
      category_id: snap.id,
      date,
      shamsi_date: '۱۴۰۵/۰۸/۱۱',
    });
  }
  createTransaction(db, {
    amount: 250000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-11-04T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۳',
    note: 'بنزین',
  });
  for (const date of ['2026-11-05T12:00:00', '2026-11-06T12:00:00']) {
    createTransaction(db, {
      amount: 500000,
      type: 'expense',
      category_id: food.id,
      date,
      shamsi_date: '۱۴۰۵/۰۸/۱۴',
    });
  }
  // بیرون از بازه
  createTransaction(db, {
    amount: 999000,
    type: 'expense',
    category_id: fuel.id,
    date: '2026-09-01T10:00:00',
    shamsi_date: '۱۴۰۵/۰۶/۱۰',
  });

  const incomeTotals = getCategoryTotals(db, range, 'income');
  assert.equal(incomeTotals.length, 2);
  assert.equal(incomeTotals[0].name, 'حقوق و درآمد ماهانه');
  assert.equal(incomeTotals[0].total, 10000000);
  assert.equal(incomeTotals[0].count, 1);
  assert.equal(incomeTotals[1].name, 'فعالیت در اسنپ (مسافرکشی روزانه)');
  assert.equal(incomeTotals[1].total, 4000000);
  assert.equal(incomeTotals[1].count, 2);

  const expenseTotals = getCategoryTotals(db, range, 'expense');
  assert.equal(expenseTotals.length, 2);
  assert.equal(expenseTotals[0].name, 'خوراک و مواد غذایی');
  assert.equal(expenseTotals[0].total, 1000000);
  assert.equal(expenseTotals[0].count, 2);
  assert.equal(expenseTotals[1].name, 'بنزین و سوخت خودرو');
  assert.equal(expenseTotals[1].total, 250000);

  const summary = getSummary(db, range);
  assert.equal(
    incomeTotals.reduce((sum, item) => sum + item.total, 0),
    summary.income,
  );
  assert.equal(
    expenseTotals.reduce((sum, item) => sum + item.total, 0),
    summary.expense,
  );
});

test('search matches notes and amounts in any digit form', () => {
  const db = setup();
  const oil = findCategory(db, 'تعویض روغن و فیلتر');

  createTransaction(db, {
    amount: 1250000,
    type: 'expense',
    category_id: oil.id,
    date: '2026-11-09T10:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
    note: 'تعویض لنت جلو',
  });

  const [row] = listTransactions(db, null);
  assert.ok(row);

  assert.equal(normalizeSearchQuery(' ۲۵۰,۰۰۰ '), '250000');

  assert.equal(matchesTransactionQuery(row, ''), true);
  assert.equal(matchesTransactionQuery(row, 'لنت'), true);
  assert.equal(matchesTransactionQuery(row, 'جلو'), true);
  assert.equal(matchesTransactionQuery(row, 'روغن'), true); // از نام دسته
  assert.equal(matchesTransactionQuery(row, '۱۲۵۰'), true);
  assert.equal(matchesTransactionQuery(row, '۱,۲۵۰,۰۰۰'), true);
  assert.equal(matchesTransactionQuery(row, '1250000'), true);
  assert.equal(matchesTransactionQuery(row, 'بنزین'), false);
  assert.equal(matchesTransactionQuery(row, '999'), false);
});
