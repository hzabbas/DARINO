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
import { balanceEffect } from './accountRules';
import { adjustAccountBalance, applyTransactionDelta, getBankAccount, isPostBalanceAnchor } from './bankAccounts';
import { notifyDbChange } from './events';
import { runInTransaction } from './transaction';

// Re-export balanceEffect for unified import
export { balanceEffect } from './accountRules';

const TRANSACTION_WITH_CATEGORY_SQL = `
SELECT
  t.id,
  t.amount,
  t.type,
  t.category_id,
  t.date,
  t.shamsi_date,
  t.note,
  t.created_at,
  t.bank_account_id,
  c.name AS category_name,
  c.icon AS category_icon,
  c.color AS category_color
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
`;

/** Transaction list composite filters (range, type, bank link) */
export interface TransactionListFilter {
  range?: DateRange | null;
  type?: TransactionType | 'all';
  /** 'linked' = bank account, 'manual' = unlinked cash, 'any' = all */
  bankLink?: 'any' | 'linked' | 'manual';
}

/** Date range filter clause */
function rangeFilter(range: DateRange | null): { clause: string; params: string[] } {
  if (!range) {
    return { clause: '', params: [] };
  }
  return { clause: 'WHERE t.date >= ? AND t.date < ?', params: [range.startIso, range.endIso] };
}

function composeFilter(filter: TransactionListFilter): { clause: string; params: (string | number)[] } {
  const parts: string[] = [];
  const params: (string | number)[] = [];

  if (filter.range) {
    parts.push('t.date >= ? AND t.date < ?');
    params.push(filter.range.startIso, filter.range.endIso);
  }
  if (filter.type && filter.type !== 'all') {
    parts.push('t.type = ?');
    params.push(filter.type);
  }
  if (filter.bankLink === 'linked') {
    parts.push('t.bank_account_id IS NOT NULL');
  } else if (filter.bankLink === 'manual') {
    parts.push('t.bank_account_id IS NULL');
  }

  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

/** Reverses previous transaction effect on account balance */
export function reverseTransactionEffect(db: SqlDatabase, transaction: Transaction): void {
  if (!transaction.bank_account_id) return;
  adjustAccountBalance(
    db,
    transaction.bank_account_id,
    -balanceEffect(transaction.amount, transaction.type),
  );
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
  /** Whether to apply balance effect to linked bank account */
  applyBalanceEffect?: boolean;
}

/** Creates transaction and conditionally applies balance delta */
export function createTransaction(
  db: SqlDatabase,
  input: NewTransaction,
  options: CreateTransactionOptions = {},
): number {
  const amount = assertValidTransaction(input);
  const note = input.note?.trim() ? input.note.trim() : null;
  const accountId = input.bank_account_id ?? null;
  const applyBalanceEffect = options.applyBalanceEffect !== false;

  let insertedId = 0;

  runInTransaction(db, () => {
    const result = db.runSync(
      `INSERT INTO transactions
        (amount, type, category_id, date, shamsi_date, note, created_at, bank_account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      amount,
      input.type,
      input.category_id,
      input.date,
      input.shamsi_date,
      note,
      toLocalIso(new Date()),
      accountId,
    );
    insertedId = result.lastInsertRowId;

    if (applyBalanceEffect) {
      applyTransactionDelta(db, accountId, balanceEffect(amount, input.type), input.date);
    }
  });

  notifyDbChange();
  return insertedId;
}

/** Updates transaction and reconciles bank balance */
export function updateTransaction(db: SqlDatabase, id: number, input: NewTransaction): void {
  const amount = assertValidTransaction(input);
  const note = input.note?.trim() ? input.note.trim() : null;
  const previous = getTransaction(db, id);

  const nextAccountId =
    input.bank_account_id === undefined ? (previous?.bank_account_id ?? null) : input.bank_account_id;

  runInTransaction(db, () => {
    if (previous) {
      const previousAccount = previous.bank_account_id
        ? getBankAccount(db, previous.bank_account_id)
        : null;
      if (previousAccount && isPostBalanceAnchor(previousAccount, previous.date)) {
        reverseTransactionEffect(db, previous);
      }
    }

    db.runSync(
      `UPDATE transactions
       SET amount = ?, type = ?, category_id = ?, date = ?, shamsi_date = ?, note = ?, bank_account_id = ?
       WHERE id = ?`,
      amount,
      input.type,
      input.category_id,
      input.date,
      input.shamsi_date,
      note,
      nextAccountId,
      id,
    );

    applyTransactionDelta(db, nextAccountId, balanceEffect(amount, input.type), input.date);
  });

  notifyDbChange();
}

/** Deletes transaction and reverses its balance effect */
export function deleteTransaction(db: SqlDatabase, id: number): void {
  const previous = getTransaction(db, id);

  runInTransaction(db, () => {
    if (previous?.bank_account_id) {
      const account = getBankAccount(db, previous.bank_account_id);
      if (account && isPostBalanceAnchor(account, previous.date)) {
        reverseTransactionEffect(db, previous);
      }
    }
    db.runSync('DELETE FROM transactions WHERE id = ?', id);
  });

  notifyDbChange();
}

export interface DuplicateCandidate extends TransactionWithCategory {
  /** Time difference in hours */
  hoursApart: number;
}

/** Finds similar transactions within a time window (default 36h) */
export function findDuplicateCandidates(
  db: SqlDatabase,
  input: { amount: number; type: TransactionType; dateIso: string; windowHours?: number },
): DuplicateCandidate[] {
  const center = new Date(input.dateIso).getTime();
  const amount = Math.trunc(input.amount);
  if (!Number.isFinite(center) || amount <= 0) return [];

  const window = Math.max(1, input.windowHours ?? 36);
  const from = toLocalIso(new Date(center - window * 60 * 60 * 1000));
  const to = toLocalIso(new Date(center + window * 60 * 60 * 1000));

  const rows = db.getAllSync<TransactionWithCategory>(
    `${TRANSACTION_WITH_CATEGORY_SQL}
     WHERE t.amount = ? AND t.type = ? AND t.date >= ? AND t.date <= ?
     ORDER BY t.date DESC`,
    amount,
    input.type,
    from,
    to,
  );

  return rows
    .map((row) => ({ ...row, hoursApart: Math.abs(new Date(row.date).getTime() - center) / 3600000 }))
    .sort((a, b) => a.hoursApart - b.hoursApart);
}

/** Lists transactions for date range ordered newest first */
export function listTransactions(
  db: SqlDatabase,
  range: DateRange | null,
  limit = -1,
  filter: Omit<TransactionListFilter, 'range'> = {},
): TransactionWithCategory[] {
  const { clause, params } = composeFilter({ ...filter, range });
  return db.getAllSync<TransactionWithCategory>(
    `${TRANSACTION_WITH_CATEGORY_SQL}
     ${clause}
     ORDER BY t.date DESC, t.id DESC
     LIMIT ?`,
    ...params,
    limit,
  );
}

export function listRecentTransactions(db: SqlDatabase, limit = 8): TransactionWithCategory[] {
  return listTransactions(db, null, limit);
}

export function getTransaction(db: SqlDatabase, id: number): Transaction | null {
  return db.getFirstSync<Transaction>(
    `SELECT id, amount, type, category_id, date, shamsi_date, note, created_at, bank_account_id
     FROM transactions WHERE id = ?`,
    id,
  );
}

export function getTransactionWithCategory(
  db: SqlDatabase,
  id: number,
): TransactionWithCategory | null {
  return db.getFirstSync<TransactionWithCategory>(
    `${TRANSACTION_WITH_CATEGORY_SQL} WHERE t.id = ?`,
    id,
  );
}

/** Total income and expense in range */
export function getSummary(db: SqlDatabase, range: DateRange | null): MonthlySummary {
  const { clause, params } = rangeFilter(range);
  const row = db.getFirstSync<{ income: number; expense: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS expense
     FROM transactions t
     ${clause}`,
    ...params,
  );

  const income = row?.income ?? 0;
  const expense = row?.expense ?? 0;
  return { income, expense, balance: income - expense };
}

/** Category totals grouped and sorted by amount descending */
export function getCategoryTotals(
  db: SqlDatabase,
  range: DateRange | null,
  type: TransactionType,
): CategoryTotal[] {
  const { clause, params } = rangeFilter(range);
  const where = clause ? `${clause} AND t.type = ?` : `WHERE t.type = ?`;

  return db.getAllSync<CategoryTotal>(
    `SELECT
       t.category_id AS category_id,
       COALESCE(c.name, 'دسته‌بندی حذف‌شده') AS name,
       COALESCE(c.icon, 'help-circle-outline') AS icon,
       COALESCE(c.color, '#94A3B8') AS color,
       SUM(t.amount) AS total,
       COUNT(*) AS count
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     ${where}
     GROUP BY t.category_id
     ORDER BY total DESC`,
    ...params,
    type,
  );
}

export function getExpenseByCategory(db: SqlDatabase, range: DateRange | null): CategoryTotal[] {
  return getCategoryTotals(db, range, 'expense');
}

export function countTransactions(db: SqlDatabase): number {
  const row = db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM transactions');
  return row?.total ?? 0;
}

export function countTransactionsInRange(db: SqlDatabase, range: DateRange | null): number {
  const { clause, params } = rangeFilter(range);
  const row = db.getFirstSync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM transactions t ${clause}`,
    ...params,
  );
  return row?.total ?? 0;
}
