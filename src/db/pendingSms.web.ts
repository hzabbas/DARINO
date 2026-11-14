import type { NewPendingSms, PendingSms, PendingSmsStatus, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { balanceEffect, isPostBalanceAnchor } from './accountRules';
import {
  adjustAccountBalance,
  applyTransactionDelta,
  getBankAccount,
  setAccountBalance,
} from './bankAccounts.web';
import { createCategory, listCategories } from './categories.web';
import { notifyDbChange } from './events';
import { getWebStore, persistWebStore } from './store.web';
import { createTransaction } from './transactions.web';

export function getPendingSms(_db: SqlDatabase, id: number): PendingSms | null {
  return getWebStore().pendingSms.find((item) => item.id === id) ?? null;
}

export function listPendingSms(_db: SqlDatabase, status: PendingSmsStatus | 'all' = 'pending'): PendingSms[] {
  const rows = getWebStore().pendingSms;
  const filtered = status === 'all' ? rows : rows.filter((item) => item.status === status);
  return filtered.slice().sort((first, second) => second.date.localeCompare(first.date));
}

export function countPendingSms(_db: SqlDatabase): number {
  return getWebStore().pendingSms.filter((item) => item.status === 'pending').length;
}

export function insertPendingSms(
  _db: SqlDatabase,
  input: NewPendingSms,
): { inserted: boolean; row: PendingSms | null } {
  const store = getWebStore();
  const existing = store.pendingSms.find((item) => item.sms_id === input.sms_id);
  if (existing) {
    return { inserted: false, row: existing };
  }

  const row: PendingSms = {
    id: store.nextPendingSmsId,
    sms_id: input.sms_id,
    sender: input.sender,
    bank_account_id: input.bank_account_id,
    raw_body: input.raw_body,
    detected_type: input.detected_type,
    amount: Math.max(0, Math.trunc(input.amount)),
    fee_amount: Math.trunc(input.fee_amount ?? 0),
    roundup_amount: Math.trunc(input.roundup_amount ?? 0),
    detected_balance: input.detected_balance ?? null,
    date: input.date,
    shamsi_date: input.shamsi_date,
    time: input.time ?? null,
    transfer_pair_id: null,
    status: 'pending',
    created_at: toLocalIso(new Date()),
    merchant: input.merchant ?? null,
    suggested_category_id: input.suggested_category_id ?? null,
  };

  store.pendingSms = [...store.pendingSms, row];
  store.nextPendingSmsId += 1;
  persistWebStore();
  notifyDbChange();
  return { inserted: true, row };
}

export function ensureBankFeeCategory(_db: SqlDatabase): number {
  const existing = listCategories(undefined as unknown as SqlDatabase, 'expense').find(
    (category) => category.name === 'کارمزد بانکی',
  );
  if (existing) return existing.id;

  return createCategory(undefined as unknown as SqlDatabase, {
    name: 'کارمزد بانکی',
    type: 'expense',
    icon: 'cash-outline',
    color: '#64748B',
  });
}

export interface ApprovePendingInput {
  id: number;
  categoryId?: number | null;
}

/** مهر زمانی رسیدن پیامک (بر اساس تاریخ همان پیامک، نه ساعت گوشی). */
export function pendingSmsTimestamp(row: PendingSms): number {
  const parsed = new Date(row.date).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * تایید پیامک در نسخه‌ی وب — عیناً همان قواعد نسخه‌ی SQLite:
 * تراکنش به حساب بانکی وصل می‌شود، و اگر پیامک «مانده‌ی جدید بانک» داشت همان عدد
 * تنها منبع حقیقت است و لنگر موجودی را جلو می‌برد.
 */
export function approvePendingSms(db: SqlDatabase, input: ApprovePendingInput): boolean {
  const store = getWebStore();
  const row = store.pendingSms.find((item) => item.id === input.id);
  if (!row || row.status !== 'pending') {
    return false;
  }

  if (row.detected_type === 'transfer') {
    if (row.fee_amount > 0) {
      createTransaction(db, {
        amount: row.fee_amount,
        type: 'expense',
        category_id: ensureBankFeeCategory(db),
        date: row.date,
        shamsi_date: row.shamsi_date,
        note: 'کارمزد انتقال بین حساب‌ها',
      });
    }
  } else {
    if (!input.categoryId) {
      throw new Error('برای ثبت این پیامک یک دسته‌بندی انتخاب کن');
    }

    createTransaction(
      db,
      {
        amount: row.amount,
        type: row.detected_type,
        category_id: input.categoryId,
        date: row.date,
        shamsi_date: row.shamsi_date,
        // مثل نسخه‌ی SQLite: نام فروشنده به توضیح تراکنش می‌رود تا تاریخچه بسازد
        note: row.merchant ?? null,
        bank_account_id: row.bank_account_id,
      },
      // مانده‌ی پیامک مطلق است؛ دلتای این تراکنش دوباره اعمال نمی‌شود.
      { applyBalanceEffect: row.detected_balance === null },
    );

    if (row.bank_account_id && row.detected_balance !== null) {
      setAccountBalance(db, row.bank_account_id, row.detected_balance, pendingSmsTimestamp(row));
    }
  }

  store.pendingSms = store.pendingSms.map((item) =>
    item.id === row.id ? { ...item, status: 'approved' } : item,
  );
  persistWebStore();
  notifyDbChange();
  return true;
}

export interface MergePendingResult {
  merged: boolean;
  transactionId: number | null;
  balanceApplied: boolean;
}

/**
 * ادغام پیامک با تراکنشی که کاربر قبلاً دستی ثبت کرده است (بدون ثبت تکراری):
 * تراکنش موجود به حساب بانکی وصل می‌شود، پیامک تایید می‌شود و اگر مانده‌ی جدید
 * داشت، موجودی حساب با همان عدد به‌روز می‌شود.
 */
export function mergePendingSmsWithTransaction(
  db: SqlDatabase,
  input: { pendingId: number; transactionId: number },
): MergePendingResult {
  const store = getWebStore();
  const row = store.pendingSms.find((item) => item.id === input.pendingId);
  const target = store.transactions.find((item) => item.id === input.transactionId);

  if (!row || row.status !== 'pending' || !target || row.detected_type === 'transfer') {
    return { merged: false, transactionId: null, balanceApplied: false };
  }

  const accountId = row.bank_account_id;
  const previousAccountId = target.bank_account_id;
  const sameAccount = accountId !== null && previousAccountId === accountId;
  let balanceApplied = false;

  if (previousAccountId && previousAccountId !== accountId) {
    const prevAccount = store.bankAccounts.find((a) => a.id === previousAccountId);
    if (prevAccount && isPostBalanceAnchor(prevAccount, target.date)) {
      adjustAccountBalance(db, previousAccountId, -balanceEffect(target.amount, target.type));
    }
  }

  store.transactions = store.transactions.map((item) =>
    item.id === target.id
      ? {
          ...item,
          bank_account_id: accountId,
          note: item.note && item.note.trim() ? item.note : (row.merchant ?? item.note),
        }
      : item,
  );

  if (accountId) {
    if (row.detected_balance !== null) {
      setAccountBalance(db, accountId, row.detected_balance, pendingSmsTimestamp(row));
      balanceApplied = true;
    } else if (!sameAccount) {
      balanceApplied = applyTransactionDelta(
        db,
        accountId,
        balanceEffect(target.amount, target.type),
        target.date,
      );
    }
  }

  store.pendingSms = store.pendingSms.map((item) =>
    item.id === row.id ? { ...item, status: 'approved' } : item,
  );
  persistWebStore();
  notifyDbChange();
  return { merged: true, transactionId: target.id, balanceApplied };
}

/** «رد کردن پیامک‌های قدیمی‌تر از امروز». */
export function ignorePendingSmsBefore(_db: SqlDatabase, timestamp: number): number {
  const store = getWebStore();
  const limit = toLocalIso(new Date(timestamp));
  const matches = store.pendingSms.filter((item) => item.status === 'pending' && item.date < limit);
  store.pendingSms = store.pendingSms.map((item) =>
    item.status === 'pending' && item.date < limit ? { ...item, status: 'ignored' } : item,
  );
  persistWebStore();
  notifyDbChange();
  return matches.length;
}

/** شمارش پیامک‌های منتظر تایید با تاریخ قبل از یک مهر زمانی. */
export function countPendingSmsBefore(_db: SqlDatabase, timestamp: number): number {
  const limit = toLocalIso(new Date(timestamp));
  return getWebStore().pendingSms.filter((item) => item.status === 'pending' && item.date < limit).length;
}

/** پاک‌کردن کل صف پیامک‌های منتظر تایید. */
export function clearPendingSmsQueue(_db: SqlDatabase): number {
  const store = getWebStore();
  const count = store.pendingSms.filter((item) => item.status === 'pending').length;
  store.pendingSms = store.pendingSms.filter((item) => item.status !== 'pending');
  persistWebStore();
  notifyDbChange();
  return count;
}

/** حذف کامل همه‌ی ردیف‌های صف پیامک. */
export function deleteAllPendingSms(_db: SqlDatabase): number {
  const store = getWebStore();
  const count = store.pendingSms.length;
  store.pendingSms = [];
  persistWebStore();
  notifyDbChange();
  return count;
}

export function ignorePendingSms(_db: SqlDatabase, id: number): void {
  const store = getWebStore();
  store.pendingSms = store.pendingSms.map((item) =>
    item.id === id ? { ...item, status: 'ignored' } : item,
  );
  persistWebStore();
  notifyDbChange();
}

export function deletePendingSms(_db: SqlDatabase, id: number): void {
  const store = getWebStore();
  store.pendingSms = store.pendingSms.filter((item) => item.id !== id);
  persistWebStore();
  notifyDbChange();
}

export function linkPendingPair(
  _db: SqlDatabase,
  expenseId: number,
  incomeId: number,
  fee: number,
): void {
  const store = getWebStore();
  const pairId = `pair_${expenseId}_${incomeId}`;
  store.pendingSms = store.pendingSms.map((item) => {
    if (item.id === expenseId) {
      return { ...item, detected_type: 'transfer' as const, transfer_pair_id: pairId, fee_amount: Math.max(0, Math.trunc(fee)) };
    }
    if (item.id === incomeId) {
      return { ...item, detected_type: 'transfer' as const, transfer_pair_id: pairId, fee_amount: 0 };
    }
    return item;
  });
  persistWebStore();
  notifyDbChange();
}

export function getPendingAccountTitle(_db: SqlDatabase, accountId: number | null): string | null {
  if (!accountId) return null;
  return getBankAccount(undefined as unknown as SqlDatabase, accountId)?.title ?? null;
}
