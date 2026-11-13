import type { SqlDatabase } from '../types/models';
import { zeroAllBalances } from './bankAccounts';
import { notifyDbChange } from './events';
import { seedDefaultCategories } from './seed';
import { runInTransaction } from './transaction';

export interface ResetSummary {
  transactions: number;
  pendingSms: number;
  accounts: number;
  categories: number;
  settings: number;
  seeded: number;
}

function countRows(db: SqlDatabase, table: string): number {
  const row = db.getFirstSync<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
  return row?.total ?? 0;
}

export interface TransactionsResetSummary {
  transactions: number;
  pendingSms: number;
  accountsZeroed: number;
}

/**
 * «ریست تراکنش‌ها و موجودی‌ها»:
 * همه‌ی تراکنش‌ها و پیامک‌های تاییدشده/منتظر حذف می‌شوند و موجودی حساب‌ها صفر
 * می‌شود؛ ولی تعریف حساب‌های بانکی، دسته‌بندی‌های کاربر و تنظیمات دست‌نخورده
 * می‌مانند. پس کاربر می‌تواند از صفر شروع کند و بانک‌هایش را دوباره تنظیم نکند.
 */
export function resetTransactionsAndBalances(db: SqlDatabase): TransactionsResetSummary {
  const transactions = countRows(db, 'transactions');
  const pendingSms = countRows(db, 'pending_sms');
  let accountsZeroed = 0;

  runInTransaction(db, () => {
    db.runSync('DELETE FROM transactions');
    db.runSync('DELETE FROM pending_sms');
    accountsZeroed = zeroAllBalances(db);
    resetAutoIncrement(db, ['transactions', 'pending_sms']);
  });

  notifyDbChange();
  return { transactions, pendingSms, accountsZeroed };
}

/**
 * «ریست کارخانه»:
 * همه‌ی جدول‌ها خالی می‌شوند (تراکنش، حساب بانکی، دسته‌بندی، صف پیامک، تنظیمات) و
 * دیتابیس دوباره با داده‌های پیش‌فرض پر می‌شود؛ برنامه دقیقاً مثل نصب تازه می‌شود.
 * همه‌ی این کارها داخل یک تراکنش دیتابیس انجام می‌شود تا ریست نیمه‌کاره نماند.
 */
export function factoryReset(db: SqlDatabase): ResetSummary {
  const summary: ResetSummary = {
    transactions: countRows(db, 'transactions'),
    pendingSms: countRows(db, 'pending_sms'),
    accounts: countRows(db, 'bank_accounts'),
    categories: countRows(db, 'categories'),
    settings: countRows(db, 'settings'),
    seeded: 0,
  };

  runInTransaction(db, () => {
    db.runSync('DELETE FROM transactions');
    db.runSync('DELETE FROM pending_sms');
    db.runSync('DELETE FROM bank_accounts');
    db.runSync('DELETE FROM categories');
    db.runSync('DELETE FROM settings');
    resetAutoIncrement(db, [
      'transactions',
      'pending_sms',
      'bank_accounts',
      'categories',
    ]);
    summary.seeded = seedDefaultCategories(db);
  });

  notifyDbChange();
  return summary;
}

/**
 * شمارنده‌ی AUTOINCREMENT را صفر می‌کند تا شناسه‌ها از ۱ شروع شوند.
 * جدول `sqlite_sequence` فقط وقتی وجود دارد که حداقل یک جدول AUTOINCREMENT داشته
 * باشد؛ پس نبودش خطا نیست.
 */
function resetAutoIncrement(db: SqlDatabase, tables: string[]): void {
  try {
    db.runSync(
      `DELETE FROM sqlite_sequence WHERE name IN (${tables.map(() => '?').join(', ')})`,
      ...tables,
    );
  } catch {
    // دیتابیس‌های بدون AUTOINCREMENT این جدول را ندارند
  }
}
