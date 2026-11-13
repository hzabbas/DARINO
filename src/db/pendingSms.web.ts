import type { NewPendingSms, PendingSms, PendingSmsStatus, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { adjustAccountBalance, getBankAccount, setAccountBalance } from './bankAccounts';
import { createCategory, listCategories } from './categories';
import { notifyDbChange } from './events';
import { getWebStore, persistWebStore } from './store.web';
import { createTransaction } from './transactions';

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

    createTransaction(db, {
      amount: row.amount,
      type: row.detected_type,
      category_id: input.categoryId,
      date: row.date,
      shamsi_date: row.shamsi_date,
      // مثل نسخه‌ی SQLite: نام فروشنده به توضیح تراکنش می‌رود تا تاریخچه بسازد
      note: row.merchant ?? null,
    });

    if (row.bank_account_id) {
      if (row.detected_balance !== null) {
        setAccountBalance(db, row.bank_account_id, row.detected_balance);
      } else {
        adjustAccountBalance(db, row.bank_account_id, row.detected_type === 'income' ? row.amount : -row.amount);
      }
    }
  }

  store.pendingSms = store.pendingSms.map((item) =>
    item.id === row.id ? { ...item, status: 'approved' } : item,
  );
  persistWebStore();
  notifyDbChange();
  return true;
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
