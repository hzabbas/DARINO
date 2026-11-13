import type {
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
import { getWebStore, persistWebStore, type WebStoreState } from './store.web';
import { notifyDbChange } from './events';

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

/**
 * ثبت تراکنش در نسخه‌ی وب.
 *
 * مثل نسخه‌ی SQLite، تراکنش‌ها به حساب بانکی وصل نیستند و موجودی دست‌کاری
 * نمی‌شود؛ ولی اعلان تغییر باید همیشه بعد از ذخیره ارسال شود.
 */
export function createTransaction(_database: SqlDatabase, input: NewTransaction): number {
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
  };

  state.transactions.push(transaction);
  persistWebStore();
  notifyDbChange();
  return transaction.id;
}

export function updateTransaction(
  _database: SqlDatabase,
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
  state.transactions[index] = {
    ...existing,
    amount,
    type: input.type,
    category_id: input.category_id,
    date: input.date,
    shamsi_date: input.shamsi_date,
    note: input.note?.trim() ? input.note.trim() : null,
  };
  persistWebStore();

  notifyDbChange();
}

export function deleteTransaction(_database: SqlDatabase, id: number): void {
  const state = getWebStore();
  state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
  persistWebStore();

  notifyDbChange();
}

/** تراکنش‌های یک بازه، از جدیدترین به قدیمی‌ترین (limit منفی = بدون محدودیت). */
export function listTransactions(
  database: SqlDatabase,
  range: DateRange | null,
  limit = -1,
): TransactionWithCategory[] {
  const state = getWebStore();
  const rows = state.transactions
    .filter((transaction) => inRange(transaction, range))
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
