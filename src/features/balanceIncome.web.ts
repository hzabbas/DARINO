import type { DateRange, SqlDatabase } from '../types/models';
import { getBankBalanceBreakdown, reanchorActiveAccounts } from '../db/bankAccounts.web';
import { createCategory, listCategories } from '../db/categories.web';
import { createTransaction, listTransactions, updateTransaction } from '../db/transactions.web';
import { formatShamsiShort, toLocalIso } from '../utils/jalali';
import { getWebStore, persistWebStore } from '../db/store.web';
import { notifyDbChange } from '../db/events';

/** کلید تنظیم حالت نمایشی «احتساب موجودی کارت‌ها در درآمد». */
export const INCLUDE_BANK_BALANCE_IN_INCOME_KEY = 'include_bank_balance_in_income';
export const OPENING_BALANCE_CATEGORY_NAME = 'موجودی کارت‌ها و دارایی اولیه';
export const OPENING_BALANCE_NOTE = 'افتتاحیه دارایی کارت‌ها — [opening-bank-balance]';

export interface OpeningBalanceSyncResult {
  skipped: boolean;
  reason: string | null;
  amount: number;
  categoryId: number | null;
  transactionId: number | null;
  inserted: boolean;
  totalActiveBankBalance: number;
  reanchoredAccounts: number;
}

/**
 * نسخه‌ی وب. مسیرهای .web عمداً صریح‌اند: Metro خودش پلتفرم را حل می‌کند، ولی در
 * تست Node، import بدون پسوند به ماژول SQLite می‌افتد و خطای getAllSync می‌دهد.
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
  return listTransactions(db, range, -1, { type: 'income' })
    .filter((transaction) => transaction.note === OPENING_BALANCE_NOTE)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function findOpeningIncomeTransactionId(categoryId: number): number | null {
  return (
    getWebStore().transactions.find(
      (transaction) =>
        transaction.category_id === categoryId &&
        transaction.type === 'income' &&
        transaction.note === OPENING_BALANCE_NOTE,
    )?.id ?? null
  );
}

/** همان عملیات idempotent نسخه‌ی SQLite، این بار روی store وب. */
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
  const existingId = findOpeningIncomeTransactionId(categoryId);
  const date = toLocalIso(new Date(now));
  const shamsiDate = formatShamsiShort(new Date(now));
  let transactionId = existingId;

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

  const reanchoredAccounts = reanchorActiveAccounts(db, now);
  persistWebStore();
  notifyDbChange();

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
