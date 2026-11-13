import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBankAccount,
  getBankAccount,
  getBankBalanceBreakdown,
} from '../src/db/bankAccounts';
import { listCategories } from '../src/db/categories';
import { migrate } from '../src/db/migrate';
import {
  countTransactions,
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from '../src/db/transactions';
import {
  OPENING_BALANCE_CATEGORY_NAME,
  OPENING_BALANCE_NOTE,
  ensureOpeningBalanceCategory,
  sumOpeningBalanceIncomes,
  syncOpeningBalanceIncome,
} from '../src/features/balanceIncome';
import { isBankBalanceIncluded, setBankBalanceIncluded } from '../src/db/settings';
import {
  isBankBalanceIncluded as isWebBankBalanceIncluded,
  setBankBalanceIncluded as setWebBankBalanceIncluded,
} from '../src/db/settings.web';
import { combineSummaryWithBankBalance, pickAxisLabelIndices } from '../src/utils/analytics';
import { toLocalIso } from '../src/utils/jalali';
import type { SqlDatabase } from '../src/types/models';
import { createNodeDatabase } from './helpers/nodeDatabase';
import { resetWebStore } from '../src/db/store.web';
import {
  createBankAccount as createWebAccount,
  getBankBalanceBreakdown as getWebBreakdown,
} from '../src/db/bankAccounts.web';
import { createTransaction as createWebTransaction, countTransactions as countWebTransactions } from '../src/db/transactions.web';
import { syncOpeningBalanceIncome as syncWebOpening } from '../src/features/balanceIncome.web';
import { toLocalIso as toIso } from '../src/utils/jalali';

/** شبیه‌سازی سناریوی کاربر که هم کارت بانکی دارد و هم تراکنش بانکی ثبت می‌کند */
function seedBankLedger(): { db: SqlDatabase; accountId: number; otherId: number } {
  const db = createNodeDatabase();
  migrate(db);
  const accountId = createBankAccount(db, {
    bank_code: 'blu',
    title: 'بلوبانک',
    current_balance: 5_000_000,
  });
  const otherId = createBankAccount(db, {
    bank_code: 'mellat',
    title: 'ملت',
    current_balance: 2_000_000,
  });
  return { db, accountId, otherId };
}

function incomeCategoryId(db: SqlDatabase): number {
  const category = listCategories(db, 'income')[0];
  if (!category) throw new Error('دسته‌ی درآمد پیش‌فرض پیدا نشد');
  return category.id;
}

function expenseCategoryId(db: SqlDatabase): number {
  return listCategories(db, 'expense')[0].id;
}

test('base balance excludes every linked bank transaction, not only post-anchor ones', () => {
  const { db, accountId } = seedBankLedger();
  const income = incomeCategoryId(db);

  createTransaction(db, {
    amount: 1_000_000,
    type: 'income',
    category_id: income,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  // این هزینه قدیمی‌تر از لنگر است ولی در لجر است و نباید دوباره در پایه شمرده شود
  createTransaction(db, {
    amount: 200_000,
    type: 'expense',
    category_id: expenseCategoryId(db),
    date: toLocalIso(new Date(Date.now() - 3 * 86400000)),
    shamsi_date: '۱۴۰۵/۰۸/۱۹',
    bank_account_id: accountId,
  });
  // تراکنش دستیِ بدون حساب، اصلاً وارد مبنای کارت نمی‌شود
  createTransaction(db, {
    amount: 9_000_000,
    type: 'income',
    category_id: income,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  const breakdown = getBankBalanceBreakdown(db);
  const account = breakdown.accounts.find((row) => row.accountId === accountId);
  assert.ok(account);
  assert.equal(account.currentBalance, 6_000_000, 'فقط درآمدِ بعد از لنگر در موجودی تاثیر دارد');
  assert.equal(account.trackedIncome, 1_000_000);
  assert.equal(account.trackedExpense, 200_000);
  assert.equal(account.baseBalance, 5_200_000, 'اثرِ هر تراکنش بانکی لجر از موجودی کم شد');

  assert.equal(breakdown.totalActiveBankBalance, 8_000_000);
  assert.equal(breakdown.totalBaseBankBalance, 7_200_000);
});

test('editing or deleting the linked transaction leaves the same untracked base', () => {
  const { db, accountId } = seedBankLedger();
  const id = createTransaction(db, {
    amount: 700_000,
    type: 'income',
    category_id: incomeCategoryId(db),
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });

  updateTransaction(db, id, {
    amount: 900_000,
    type: 'income',
    category_id: incomeCategoryId(db),
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  assert.equal(getBankBalanceBreakdown(db).accounts.find((a) => a.accountId === accountId)?.baseBalance, 5_000_000);

  deleteTransaction(db, id);
  assert.equal(getBankBalanceBreakdown(db).accounts.find((a) => a.accountId === accountId)?.baseBalance, 5_000_000);
});

test('include mode adds base balance once and strips the opening record so nothing is counted twice', () => {
  const summary = { income: 1_000_000, expense: 400_000, balance: 600_000 };

  // بدون حالت «احتساب کارت‌ها»: همان خلاصه‌ی اصلی
  assert.deepEqual(combineSummaryWithBankBalance(summary, {
    include: false,
    openingIncomeInRange: 0,
    baseBankBalance: 5_000_000,
  }), summary);

  // با موجودی پایه: 1م + 5م
  assert.deepEqual(combineSummaryWithBankBalance(summary, {
    include: true,
    openingIncomeInRange: 0,
    baseBankBalance: 5_000_000,
  }), { income: 6_000_000, expense: 400_000, balance: 5_600_000 });

  // اگر افتتاحیه قبلاً ثبت شده باشد، آن تراکنش قبل از جمعِ پایه کم می‌شود؛ نه این‌که
  // همان ۵م یک‌بار در تراکنش و یک‌بار در پایه بیاید.
  const withOpening = { income: 6_000_000, expense: 400_000, balance: 5_600_000 };
  assert.deepEqual(combineSummaryWithBankBalance(withOpening, {
    include: true,
    openingIncomeInRange: 5_000_000,
    baseBankBalance: 5_000_000,
  }), { income: 6_000_000, expense: 400_000, balance: 5_600_000 });
});

test('opening-balance sync is an idempotent upsert and its amount does not inflate on a second tap', () => {
  const { db, accountId } = seedBankLedger();
  const firstLinkedId = createTransaction(db, {
    amount: 1_000_000,
    type: 'income',
    category_id: incomeCategoryId(db),
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });

  const first = syncOpeningBalanceIncome(db);
  assert.equal(first.skipped, false);
  assert.equal(first.amount, 7_000_000, '۸م موجودی منهای ۱م درآمدِ قبلاً ثبت‌شده');
  assert.equal(first.inserted, true);
  assert.equal(first.reanchoredAccounts, 2);
  assert.ok(first.transactionId);
  assert.equal(countTransactions(db), 2, 'یک تراکنش بانکی + یک افتتاحیه');

  const openingRow = db.getFirstSync<{ amount: number; note: string; category_id: number; bank_account_id: number | null }>(
    'SELECT amount, note, category_id, bank_account_id FROM transactions WHERE id = ?',
    first.transactionId,
  );
  assert.ok(openingRow);
  assert.equal(openingRow.amount, 7_000_000);
  assert.equal(openingRow.note, OPENING_BALANCE_NOTE);
  assert.equal(openingRow.bank_account_id, null, 'افتتاحیه خودش موجودی را تغییر نمی‌دهد');
  assert.equal(sumOpeningBalanceIncomes(db, null), 7_000_000);

  const category = listCategories(db, 'income').find((c) => c.id === openingRow.category_id);
  assert.equal(category?.name, OPENING_BALANCE_CATEGORY_NAME);
  assert.equal(category?.icon, 'wallet');
  assert.equal(category?.color, '#10B981');

  const anchor = getBankAccount(db, accountId)?.balance_anchor_ts ?? 0;
  assert.ok(anchor > 0);

  // دوباره‌ی دکمه: نباید ردیف جدید ساخته شود و نباید مبلغ، درآمدهای قدیمی را دوباره
  // داخل پایه بکشد (این همان تله‌ی جلو بردن لنگر بود).
  const second = syncOpeningBalanceIncome(db, Date.now() + 1000);
  assert.equal(second.inserted, false);
  assert.equal(second.transactionId, first.transactionId);
  assert.equal(second.amount, first.amount, 'مبلغ ثابت می‌ماند نه این‌که به موجودی فعلی تبدیل شود');
  assert.equal(countTransactions(db), 2);
  assert.equal(sumOpeningBalanceIncomes(db, null), first.amount);

  // درآمد بانکی جدید باید در گزارش شمرده شود، نه در افتتاحیه‌ی بعدی
  createTransaction(db, {
    amount: 500_000,
    type: 'income',
    category_id: incomeCategoryId(db),
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  const third = syncOpeningBalanceIncome(db, Date.now() + 2000);
  assert.equal(third.transactionId, first.transactionId);
  assert.equal(third.amount, first.amount, 'درآمد بانکی جدید دوباره در افتتاحیه نمی‌آید');
  assert.equal(countTransactions(db), 3);
  assert.equal(sumOpeningBalanceIncomes(db, null), first.amount);

  assert.ok(firstLinkedId > 0);
});

test('ensureOpeningBalanceCategory is reused and the sync refuses empty bases', () => {
  const db = createNodeDatabase();
  migrate(db);

  const categoryId = ensureOpeningBalanceCategory(db);
  assert.equal(ensureOpeningBalanceCategory(db), categoryId, 'دسته‌ی تکراری ساخته نمی‌شود');

  const result = syncOpeningBalanceIncome(db);
  assert.equal(result.skipped, true);
  assert.equal(result.amount, 0);
  assert.equal(countTransactions(db), 0, 'برای پایه‌ی صفر تراکنش درآمد نمی‌سازیم');
});

test('web mirror has the same base math and idempotent opening sync', () => {
  resetWebStore();
  const accountId = createWebAccount({} as SqlDatabase, {
    bank_code: 'blu',
    title: 'بلوبانک',
    current_balance: 5_000_000,
  });
  const categoryId = createWebTransaction({} as SqlDatabase, {
    amount: 500_000,
    type: 'income',
    category_id: 13,
    date: toIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  void categoryId;

  assert.equal(getWebBreakdown({} as SqlDatabase).totalBaseBankBalance, 5_000_000);

  const first = syncWebOpening({} as SqlDatabase);
  const second = syncWebOpening({} as SqlDatabase, Date.now() + 1000);

  assert.equal(first.amount, 5_000_000);
  assert.equal(second.transactionId, first.transactionId);
  assert.equal(second.amount, first.amount);
  assert.equal(countWebTransactions({} as SqlDatabase), 2, 'یکی بانکی و یکی افتتاحیه');
});

test('x-axis labels are downsampled with the endpoints retained', () => {
  assert.deepEqual(pickAxisLabelIndices(0), []);
  assert.deepEqual(pickAxisLabelIndices(3), [0, 1, 2]);
  assert.deepEqual(pickAxisLabelIndices(7, 7), [0, 1, 2, 3, 4, 5, 6]);

  const many = pickAxisLabelIndices(30, 6);
  assert.equal(many.length, 6);
  assert.equal(many[0], 0);
  assert.equal(many[many.length - 1], 29);
  assert.equal(new Set(many).size, many.length, 'اندکس‌ها یکتا و مرتب‌اند');
  assert.ok(many.every((index) => index >= 0 && index < 30));
});

test('setting include_bank_balance_in_income toggles cleanly on both sqlite and web', () => {
  const db = createNodeDatabase();
  migrate(db);

  assert.equal(isBankBalanceIncluded(db), false);
  setBankBalanceIncluded(db, true);
  assert.equal(isBankBalanceIncluded(db), true);
  setBankBalanceIncluded(db, false);
  assert.equal(isBankBalanceIncluded(db), false);

  resetWebStore();
  const webDb = {} as SqlDatabase;
  assert.equal(isWebBankBalanceIncluded(webDb), false);
  setWebBankBalanceIncluded(webDb, true);
  assert.equal(isWebBankBalanceIncluded(webDb), true);
  setWebBankBalanceIncluded(webDb, false);
  assert.equal(isWebBankBalanceIncluded(webDb), false);
});
