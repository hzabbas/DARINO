import type { DateRange, SqlDatabase } from '../types/models';
import { getBankBalanceBreakdown, reanchorActiveAccounts } from '../db/bankAccounts';
import { createCategory, listCategories } from '../db/categories';
import { createTransaction, listTransactions, updateTransaction } from '../db/transactions';
import { runInTransaction } from '../db/transaction';
import { formatShamsiShort, toLocalIso } from '../utils/jalali';

/** کلید تنظیم حالت نمایشی «احتساب موجودی کارت‌ها در درآمد». */
export const INCLUDE_BANK_BALANCE_IN_INCOME_KEY = 'include_bank_balance_in_income';

/** دسته‌ی ویژه‌ی ثبت دارایی اولیه؛ اگر کاربر نداشته باشد ساخته می‌شود. */
export const OPENING_BALANCE_CATEGORY_NAME = 'موجودی کارت‌ها و دارایی اولیه';

/** نشانه‌ی متادیتا برای پیدا کردن همان تراکنش در دفعات بعد (upsert، نه insert تکراری). */
export const OPENING_BALANCE_NOTE = 'افتتاحیه دارایی کارت‌ها — [opening-bank-balance]';

export interface OpeningBalanceSyncResult {
  skipped: boolean;
  reason: string | null;
  amount: number;
  categoryId: number | null;
  transactionId: number | null;
  /** آیا ردیف تازه ساخته شد یا قبلی به‌روز شد؟ */
  inserted: boolean;
  totalActiveBankBalance: number;
  reanchoredAccounts: number;
}

/**
 * دسته‌ی ثبت دارایی اولیه را پیدا یا می‌سازد.
 *
 * جست‌وجو با نام انجام می‌شود؛ اگر کاربر قبلاً خودش همنام را ساخته باشد، همان را
 * استفاده می‌کنیم و دسته‌ی تکراری نمی‌سازیم.
 */
export function ensureOpeningBalanceCategory(db: SqlDatabase): number {
  const existing = listCategories(db, 'income').find(
    (category) => category.name === OPENING_BALANCE_CATEGORY_NAME,
  );
  if (existing) return existing.id;

  return createCategory(db, {
    name: OPENING_BALANCE_CATEGORY_NAME,
    type: 'income',
    icon: 'wallet',
    color: '#10B981',
  });
}

/** جمع درآمد افتتاحیه‌ای که قبلاً با همین عملیات ثبت شده (برای جلوگیری از دوباره‌شماری). */
export function sumOpeningBalanceIncomes(db: SqlDatabase, range: DateRange | null): number {
  const transactions = listTransactions(db, range, -1, { type: 'income' });
  return transactions
    .filter((transaction) => transaction.note === OPENING_BALANCE_NOTE)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function findOpeningIncomeTransactionId(db: SqlDatabase, _categoryId: number): number | null {
  const found = listTransactions(db, null, -1, { type: 'income' }).find(
    (transaction) => transaction.note === OPENING_BALANCE_NOTE,
  );
  return found?.id ?? null;
}

/**
 * «ثبت موجودی کارت‌ها به‌عنوان تراکنش درآمد» — idempotent.
 *
 * این عملیات عمداً «موجودی پایه» را ثبت می‌کند نه کل موجودی: پولی که قبلاً با
 * تراکنش‌های بانکی به درآمد لجر تبدیل شده دوباره ثبت نمی‌شود. تراکنش افتتاحیه
 * `bank_account_id = null` دارد و بنابراین خودش موجودی حسابی را تغییر نمی‌دهد.
 * بعد از ثبت، لنگر موجودی همه‌ی حساب‌های فعال به همین لحظه می‌رود تا تراکنش‌های
 * بعدی روی همین مبنا انباشته شوند و «پایه» دفعه‌ی بعد کوچک‌تر یا صفر باشد.
 */
export function syncOpeningBalanceIncome(db: SqlDatabase, now = Date.now()): OpeningBalanceSyncResult {
  const breakdown = getBankBalanceBreakdown(db, true);
  const amount = Math.trunc(breakdown.totalBaseBankBalance);

  if (amount <= 0) {
    return {
      skipped: true,
      reason: 'موجودی پایه‌ی مثبتی برای ثبت درآمد وجود ندارد',
      amount,
      categoryId: null,
      transactionId: null,
      inserted: false,
      totalActiveBankBalance: breakdown.totalActiveBankBalance,
      reanchoredAccounts: 0,
    };
  }

  const categoryId = ensureOpeningBalanceCategory(db);
  const existingId = findOpeningIncomeTransactionId(db, categoryId);
  const date = toLocalIso(new Date(now));
  const shamsiDate = formatShamsiShort(new Date(now));
  let transactionId = existingId;
  let reanchoredAccounts = 0;

  runInTransaction(db, () => {
    if (existingId) {
      updateTransaction(db, existingId, {
        amount,
        type: 'income',
        category_id: categoryId,
        date,
        shamsi_date: shamsiDate,
        note: OPENING_BALANCE_NOTE,
        bank_account_id: null,
      });
    } else {
      transactionId = createTransaction(db, {
        amount,
        type: 'income',
        category_id: categoryId,
        date,
        shamsi_date: shamsiDate,
        note: OPENING_BALANCE_NOTE,
        bank_account_id: null,
      });
    }

    reanchoredAccounts = reanchorActiveAccounts(db, now);
  });

  return {
    skipped: false,
    reason: null,
    amount,
    categoryId,
    transactionId,
    inserted: existingId === null,
    totalActiveBankBalance: breakdown.totalActiveBankBalance,
    reanchoredAccounts,
  };
}
