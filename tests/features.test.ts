import assert from 'node:assert/strict';
import test from 'node:test';

import { migrate } from '../src/db/migrate';
import { getAllSettings, getNumericSetting, getSetting, setSetting } from '../src/db/settings';
import type { TransactionWithCategory } from '../src/types/models';
import {
  buildDailySeries,
  buildMonthlySeries,
  computeSmartStats,
  sharePercent,
} from '../src/utils/analytics';
import { evaluateAmountExpression } from '../src/utils/amountExpression';
import { buildTransactionsCsv } from '../src/utils/csv';
import { buildReportText } from '../src/utils/reportText';
import { createNodeDatabase } from './helpers/nodeDatabase';

function row(overrides: Partial<TransactionWithCategory>): TransactionWithCategory {
  return {
    id: 1,
    amount: 100_000,
    type: 'expense',
    category_id: 1,
    date: '2026-11-09T12:00:00',
    shamsi_date: '۱۴۰۵/۰۸/۱۸',
    note: null,
    created_at: '2026-11-09T12:00:00',
    bank_account_id: null,
    category_name: 'بنزین و سوخت خودرو',
    category_icon: 'car-outline',
    category_color: '#F97316',
    ...overrides,
  };
}

test('amount field accepts addition and subtraction expressions', () => {
  assert.equal(evaluateAmountExpression('450000+120000').value, 570000);
  assert.equal(evaluateAmountExpression('450000+120000').isExpression, true);
  assert.equal(evaluateAmountExpression('1000000-250000').value, 750000);
  assert.equal(evaluateAmountExpression('۴۵۰۰۰۰+۱۲۰۰۰۰').value, 570000);
  assert.equal(evaluateAmountExpression('۵۰۰,۰۰۰+۵۰۰,۰۰۰').value, 1_000_000);
  assert.equal(evaluateAmountExpression('٤٥٠٠٠٠+١٢٠٠٠٠').value, 570000);
  assert.equal(evaluateAmountExpression('350000').value, 350000);
  assert.equal(evaluateAmountExpression('350000').isExpression, false);
  assert.equal(evaluateAmountExpression('').value, 0);
});

test('amount expressions reject broken or oversized input', () => {
  assert.ok(evaluateAmountExpression('450000+').error);
  assert.ok(evaluateAmountExpression('+450000').error);
  assert.ok(evaluateAmountExpression('100-200').error); // نتیجه منفی
  assert.ok(evaluateAmountExpression('45abc').error);
  assert.ok(evaluateAmountExpression('9999999999999').error); // بیشتر از سقف
  assert.equal(evaluateAmountExpression('450000+').value, 0);
});

test('csv export is excel friendly (bom, crlf, escaping)', () => {
  const csv = buildTransactionsCsv([
    row({ id: 1, note: 'تعویض لنت, جلو', amount: 350000 }),
    row({ id: 2, type: 'income', category_name: 'فعالیت در اسنپ', note: 'شیفت "صبح"', amount: 900000 }),
  ]);

  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('تاریخ شمسی,تاریخ میلادی,نوع,دسته‌بندی,مبلغ (تومان),توضیحات'));
  assert.ok(csv.includes('\r\n'));
  assert.ok(csv.includes('"تعویض لنت, جلو"'));
  assert.ok(csv.includes('"شیفت ""صبح"""'));
  assert.ok(csv.includes('درآمد'));
  assert.ok(csv.includes('350000'));
});

test('monthly series buckets the last six jalali months', () => {
  const now = new Date(2026, 10, 9); // ۱۸ آبان ۱۴۰۵
  const rows = [
    row({ id: 1, date: '2026-11-05T10:00:00', amount: 500_000, type: 'income' }),
    row({ id: 2, date: '2026-11-06T10:00:00', amount: 200_000, type: 'expense' }),
    row({ id: 3, date: '2026-09-25T10:00:00', amount: 300_000, type: 'expense' }),
    row({ id: 4, date: '2020-01-01T10:00:00', amount: 999_999, type: 'income' }),
  ];

  const series = buildMonthlySeries(rows, now, 6);

  assert.equal(series.length, 6);
  assert.equal(series[5].label, 'آبان');
  assert.equal(series[5].income, 500_000);
  assert.equal(series[5].expense, 200_000);
  assert.equal(series[4].label, 'مهر');
  assert.equal(series[4].expense, 300_000);
  assert.equal(
    series.reduce((sum, point) => sum + point.income, 0),
    500_000,
    'تراکنش خارج از بازه نباید در نمودار بیاید',
  );
});

test('daily series covers the last seven days', () => {
  const now = new Date(2026, 10, 9, 15, 0, 0);
  const rows = [
    row({ id: 1, date: '2026-11-09T09:00:00', amount: 120_000, type: 'income' }),
    row({ id: 2, date: '2026-11-03T09:00:00', amount: 80_000, type: 'expense' }),
    row({ id: 3, date: '2026-10-01T09:00:00', amount: 50_000, type: 'expense' }),
  ];

  const series = buildDailySeries(rows, now, 7);

  assert.equal(series.length, 7);
  assert.equal(series[6].income, 120_000);
  assert.equal(series[0].expense, 80_000);
  assert.equal(series[0].label.length, 1);
});

test('smart stats compute averages, top category and biggest transaction', () => {
  const rows = [
    row({ id: 1, amount: 300_000, date: '2026-11-01T10:00:00' }),
    row({ id: 2, amount: 100_000, date: '2026-11-02T10:00:00' }),
    row({ id: 3, amount: 200_000, date: '2026-11-03T10:00:00', category_name: 'کارواش' }),
    row({ id: 4, amount: 400_000, date: '2026-11-04T10:00:00', type: 'income', category_name: 'اسنپ' }),
  ];

  const stats = computeSmartStats(rows, {
    startIso: '2026-11-01T00:00:00',
    endIso: '2026-11-11T00:00:00',
  });

  assert.equal(stats.days, 10);
  assert.equal(stats.avgIncome, 40_000);
  assert.equal(stats.avgExpense, 60_000);
  assert.equal(stats.topCategory?.name, 'بنزین و سوخت خودرو');
  assert.equal(stats.topCategory?.total, 400_000);
  assert.equal(stats.biggest?.id, 4);
  assert.equal(stats.count, 4);

  assert.equal(sharePercent(25, 100), 25);
  assert.equal(sharePercent(1, 0), 0);
});

test('settings table stores theme and budget values', () => {
  const db = createNodeDatabase();
  migrate(db);

  assert.equal(getSetting(db, 'theme_mode'), null);
  setSetting(db, 'theme_mode', 'dark');
  assert.equal(getSetting(db, 'theme_mode'), 'dark');

  setSetting(db, 'theme_mode', 'system');
  assert.equal(getSetting(db, 'theme_mode'), 'system');

  setSetting(db, 'income_goal', '20000000');
  setSetting(db, 'expense_budget', '15000000');
  assert.equal(getNumericSetting(db, 'income_goal'), 20_000_000);
  assert.equal(getNumericSetting(db, 'expense_budget'), 15_000_000);
  assert.equal(getNumericSetting(db, 'missing'), 0);

  setSetting(db, 'expense_budget', '');
  assert.equal(getNumericSetting(db, 'expense_budget'), 0);

  assert.deepEqual(Object.keys(getAllSettings(db)).sort(), [
    'expense_budget',
    'income_goal',
    'theme_mode',
  ]);
});

test('report text is ready to share in persian', () => {
  const text = buildReportText({
    rangeLabel: 'آبان ۱۴۰۵',
    summary: { income: 1_000_000, expense: 600_000, balance: 400_000 },
    expenseBreakdown: [
      { category_id: 1, name: 'بنزین و سوخت خودرو', icon: 'car', color: '#f00', total: 400_000, count: 2 },
      { category_id: 2, name: 'کارواش', icon: 'car', color: '#0f0', total: 200_000, count: 1 },
    ],
  });

  assert.ok(text.includes('گزارش دارینو — آبان ۱۴۰۵'));
  assert.ok(text.includes('درآمد'));
  assert.ok(text.includes('سود خالص'));
  assert.ok(text.includes('بنزین و سوخت خودرو'));
  assert.ok(text.includes('۶۷٪'));
});
