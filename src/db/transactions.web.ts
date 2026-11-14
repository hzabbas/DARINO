import type {
  BankAccount,
  CategoryTotal,
  DateRange,
  MonthlySummary,
  NewTransaction,
  SqlDatabase,
  Transaction,
  TransactionType,
  TransactionWithCategory,
} from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { balanceEffect, isPostBalanceAnchor } from './accountRules';
import { applyTransactionDelta } from './bankAccounts.web';
import { getWebStore, persistWebStore, type WebStoreState } from './store.web';
import { notifyDbChange } from './events';

// قاعده‌ی اثر تراکنش روی موجودی، مشترک با نسخه‌ی SQLite
export { balanceEffect } from './accountRules';

/** فیلترهای ترکیبی لیست تراکنش‌ها (نوع + وصل‌بودن به حساب بانکی). */
export interface TransactionListFilter {
  type?: TransactionType | 'all';
  /** `linked` = تراکنش بانکی، `manual` = تراکنش دستی، `any` = هر دو */
  bankLink?: 'any' | 'linked' | 'manual';
}

/** پیاده‌سازی نمایشی تراکنش‌ها برای وب (بدون SQLite). */

function inRange(transaction: Transaction, range: DateRange | null): boolean {
  if (!range) {
    return true;
  }
  return transaction.date >= range.startIso && transaction.date < range.endIso;
}

function withCategory(
  state: WebStoreState,
  transaction: Transaction,
): TransactionWithCategory {
  const category =
    transaction.category_id == null
      ? null
      : (state.categories.find((item) => item.id === transaction.category_id) ?? null);

  return {
    ...transaction,
    category_name: category?.name ?? null,
    category_icon: category?.icon ?? null,
    category_color: category?.color ?? null,
  };
}

function assertValidTransaction(input: NewTransaction): number {
  const amount = Math.trunc(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('مبلغ تراکنش باید بزرگ‌تر از صفر باشد');
  }
  if (!input.category_id) {
    throw new Error('دسته‌بندی تراکنش انتخاب نشده است');
  }
  return amount;
}

export interface CreateTransactionOptions {
  /** اگر `false` باشد تراکنش فقط در دفتر کل ثبت می‌شود (پیامک با «مانده‌ی جدید») */
  applyBalanceEffect?: boolean;
}

/**
 * ثبت تراکنش در نسخه‌ی وب.
 *
 * مثل نسخه‌ی SQLite: اگر تراکنش به حسابی وصل باشد و تاریخش بعد از لنگر موجودی آن
 * حساب باشد، اثرش روی موجودی اعمال می‌شود؛ تراکنش دستی بدون حساب هیچ‌وقت موجودی را
 * تغییر نمی‌دهد. اعلان تغییر همیشه بعد از ذخیره ارسال می‌شود.
 */
export function createTransaction(
  _database: SqlDatabase,
  input: NewTransaction,
  options: CreateTransactionOptions = {},
): number {
  const amount = assertValidTransaction(input);
  const state = getWebStore();

  const transaction: Transaction = {
    id: state.nextTransactionId++,
    amount,
    type: input.type,
    category_id: input.category_id,
    date: input.date,
    shamsi_date: input.shamsi_date,
    note: input.note?.trim() ? input.note.trim() : null,
    created_at: toLocalIso(new Date()),
    bank_account_id: input.bank_account_id ?? null,
  };

  state.transactions.push(transaction);
  if (options.applyBalanceEffect !== false) {
    applyTransactionDelta(
      _database,
      transaction.bank_account_id,
      balanceEffect(amount, transaction.type),
      transaction.date,
    );
  }
  persistWebStore();
  notifyDbChange();
  return transaction.id;
}

export function updateTransaction(
  database: SqlDatabase,
  id: number,
  input: NewTransaction,
): void {
  const amount = assertValidTransaction(input);
  const state = getWebStore();
  const index = state.transactions.findIndex((transaction) => transaction.id === id);
  if (index === -1) {
    return;
  }

  const existing = state.transactions[index];
  const nextAccountId =
    input.bank_account_id === undefined ? existing.bank_account_id : input.bank_account_id;

  // اول اثر قبلی برگردانده می‌شود، بعد اثر جدید اعمال می‌شود تا موجودی یک‌طرفه
  // جابه‌جا نشود (عیناً همان قاعده‌ی نسخه‌ی SQLite).
  if (existing.bank_account_id && isPostBalanceAnchor(accountOf(existing.bank_account_id), existing.date)) {
    adjustBalanceOnly(existing.bank_account_id, -balanceEffect(existing.amount, existing.type));
  }

  state.transactions[index] = {
    ...existing,
    amount,
    type: input.type,
    category_id: input.category_id,
    date: input.date,
    shamsi_date: input.shamsi_date,
    note: input.note?.trim() ? input.note.trim() : null,
    bank_account_id: nextAccountId,
  };

  applyTransactionDelta(database, nextAccountId, balanceEffect(amount, input.type), input.date);
  persistWebStore();

  notifyDbChange();
}

export function deleteTransaction(_database: SqlDatabase, id: number): void {
  const state = getWebStore();
  const existing = state.transactions.find((transaction) => transaction.id === id);

  if (existing?.bank_account_id && isPostBalanceAnchor(accountOf(existing.bank_account_id), existing.date)) {
    adjustBalanceOnly(existing.bank_account_id, -balanceEffect(existing.amount, existing.type));
  }

  state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
  persistWebStore();

  notifyDbChange();
}

/** حساب فعلی از روی شناسه؛ برای بررسی لنگر لازم است. */
function accountOf(accountId: number): BankAccount {
  return (
    getWebStore().bankAccounts.find((account) => account.id === accountId) ?? {
      id: accountId,
      bank_code: 'other',
      title: '',
      account_number: null,
      senders: [],
      initial_balance: 0,
      current_balance: 0,
      include_roundup: false,
      is_active: false,
      created_at: '',
      sync_from_ts: 0,
      balance_anchor_ts: 0,
    }
  );
}

/**
 * تغییر خالص موجودی (بدون بررسی لنگر)؛ فقط برای برگرداندن اثر تراکنش.
 * `applyTransactionDelta` خودش لنگر را بررسی می‌کند و برای اعمال اثر تازه است.
 */
function adjustBalanceOnly(accountId: number, delta: number): void {
  const state = getWebStore();
  state.bankAccounts = state.bankAccounts.map((account) =>
    account.id === accountId
      ? { ...account, current_balance: account.current_balance + Math.trunc(delta) }
      : account,
  );
}

export interface DuplicateCandidate extends TransactionWithCategory {
  /** فاصله‌ی زمانی با تراکنش مبنا، به ساعت */
  hoursApart: number;
}

/**
 * تراکنش‌های مشابه یک پیامک (همان مبلغ و همان نوع در پنجره‌ی زمانی پیش‌فرض ۳۶
 * ساعت) برای جلوگیری از ثبت دوباره‌ی چیزی که کاربر دستی وارد کرده است.
 */
export function findDuplicateCandidates(
  _database: SqlDatabase,
  input: { amount: number; type: TransactionType; dateIso: string; windowHours?: number },
): DuplicateCandidate[] {
  const center = new Date(input.dateIso).getTime();
  const amount = Math.trunc(input.amount);
  if (!Number.isFinite(center) || amount <= 0) return [];

  const windowMs = Math.max(1, input.windowHours ?? 36) * 60 * 60 * 1000;
  const state = getWebStore();

  return state.transactions
    .filter((transaction) => {
      if (transaction.amount !== amount || transaction.type !== input.type) return false;
      const time = new Date(transaction.date).getTime();
      return Number.isFinite(time) && Math.abs(time - center) <= windowMs;
    })
    .map((transaction) => ({
      ...withCategory(state, transaction),
      hoursApart: Math.abs(new Date(transaction.date).getTime() - center) / 3600000,
    }))
    .sort((first, second) => first.hoursApart - second.hoursApart);
}

/** تراکنش‌های یک بازه، از جدیدترین به قدیمی‌ترین (limit منفی = بدون محدودیت). */
export function listTransactions(
  database: SqlDatabase,
  range: DateRange | null,
  limit = -1,
  filter: TransactionListFilter = {},
): TransactionWithCategory[] {
  const state = getWebStore();
  const rows = state.transactions
    .filter((transaction) => inRange(transaction, range))
    .filter((transaction) => {
      if (filter.type && filter.type !== 'all' && transaction.type !== filter.type) return false;
      if (filter.bankLink === 'linked' && transaction.bank_account_id === null) return false;
      if (filter.bankLink === 'manual' && transaction.bank_account_id !== null) return false;
      return true;
    })
    .sort((first, second) => {
      if (first.date === second.date) {
        return second.id - first.id;
      }
      return first.date < second.date ? 1 : -1;
    })
    .map((transaction) => withCategory(state, transaction));

  return limit >= 0 ? rows.slice(0, limit) : rows;
}

export function listRecentTransactions(
  database: SqlDatabase,
  limit = 8,
): TransactionWithCategory[] {
  return listTransactions(database, null, limit);
}

export function getTransaction(_database: SqlDatabase, id: number): Transaction | null {
  const { transactions } = getWebStore();
  const found = transactions.find((transaction) => transaction.id === id);
  return found ? { ...found } : null;
}

export function getTransactionWithCategory(
  _database: SqlDatabase,
  id: number,
): TransactionWithCategory | null {
  const state = getWebStore();
  const found = state.transactions.find((transaction) => transaction.id === id);
  return found ? withCategory(state, found) : null;
}

export function getSummary(_database: SqlDatabase, range: DateRange | null): MonthlySummary {
  let income = 0;
  let expense = 0;

  for (const transaction of getWebStore().transactions) {
    if (!inRange(transaction, range)) {
      continue;
    }
    if (transaction.type === 'income') {
      income += transaction.amount;
    } else {
      expense += transaction.amount;
    }
  }

  return { income, expense, balance: income - expense };
}

export function getCategoryTotals(
  _database: SqlDatabase,
  range: DateRange | null,
  type: TransactionType,
): CategoryTotal[] {
  const state = getWebStore();
  const totals = new Map<number | null, { total: number; count: number }>();

  for (const transaction of state.transactions) {
    if (transaction.type !== type || !inRange(transaction, range)) {
      continue;
    }
    const key = transaction.category_id ?? null;
    const current = totals.get(key) ?? { total: 0, count: 0 };
    current.total += transaction.amount;
    current.count += 1;
    totals.set(key, current);
  }

  return [...totals.entries()]
    .map(([categoryId, value]) => {
      const category =
        categoryId == null
          ? null
          : (state.categories.find((item) => item.id === categoryId) ?? null);
      return {
        category_id: categoryId,
        name: category?.name ?? 'دسته‌بندی حذف‌شده',
        icon: category?.icon ?? 'help-circle-outline',
        color: category?.color ?? '#94A3B8',
        total: value.total,
        count: value.count,
      };
    })
    .sort((first, second) => second.total - first.total);
}

export function getExpenseByCategory(
  database: SqlDatabase,
  range: DateRange | null,
): CategoryTotal[] {
  return getCategoryTotals(database, range, 'expense');
}

export function countTransactions(_database: SqlDatabase): number {
  return getWebStore().transactions.length;
}

export function countTransactionsInRange(
  _database: SqlDatabase,
  range: DateRange | null,
): number {
  return getWebStore().transactions.filter((transaction) => inRange(transaction, range)).length;
}
