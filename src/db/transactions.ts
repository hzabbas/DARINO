import type {
  CategoryTotal,
  DateRange,
  MonthlySummary,
  NewTransaction,
  SqlDatabase,
  Transaction,
  TransactionWithCategory,
} from '../types/models';
import { toLocalIso } from '../utils/jalali';

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
  c.name AS category_name,
  c.icon AS category_icon,
  c.color AS category_color
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
`;

/** شرط بازه‌ی زمانی؛ برای بازه‌ی null هیچ شرطی اضافه نمی‌شود (کل زمان‌ها). */
function rangeFilter(range: DateRange | null): { clause: string; params: string[] } {
  if (!range) {
    return { clause: '', params: [] };
  }
  return { clause: 'WHERE t.date >= ? AND t.date < ?', params: [range.startIso, range.endIso] };
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

export function createTransaction(db: SqlDatabase, input: NewTransaction): number {
  const amount = assertValidTransaction(input);
  const note = input.note?.trim() ? input.note.trim() : null;

  const result = db.runSync(
    `INSERT INTO transactions (amount, type, category_id, date, shamsi_date, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    amount,
    input.type,
    input.category_id,
    input.date,
    input.shamsi_date,
    note,
    toLocalIso(new Date()),
  );

  return result.lastInsertRowId;
}

/** ویرایش تراکنش؛ تاریخ ثبت اصلی و created_at دست‌نخورده می‌مانند. */
export function updateTransaction(db: SqlDatabase, id: number, input: NewTransaction): void {
  const amount = assertValidTransaction(input);
  const note = input.note?.trim() ? input.note.trim() : null;

  db.runSync(
    `UPDATE transactions
     SET amount = ?, type = ?, category_id = ?, date = ?, shamsi_date = ?, note = ?
     WHERE id = ?`,
    amount,
    input.type,
    input.category_id,
    input.date,
    input.shamsi_date,
    note,
    id,
  );
}

export function deleteTransaction(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM transactions WHERE id = ?', id);
}

/** تراکنش‌های یک بازه، از جدیدترین به قدیمی‌ترین. limit منفی یعنی بدون محدودیت. */
export function listTransactions(
  db: SqlDatabase,
  range: DateRange | null,
  limit = -1,
): TransactionWithCategory[] {
  const { clause, params } = rangeFilter(range);
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
    'SELECT id, amount, type, category_id, date, shamsi_date, note, created_at FROM transactions WHERE id = ?',
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

/** جمع درآمد و هزینه در بازه‌ی انتخابی (null یعنی کل زمان‌ها). */
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

/** جمع هزینه‌ها به تفکیک دسته‌بندی، مرتب‌شده از بیشترین به کمترین. */
export function getExpenseByCategory(db: SqlDatabase, range: DateRange | null): CategoryTotal[] {
  const { clause, params } = rangeFilter(range);
  const where = clause ? `${clause} AND t.type = 'expense'` : `WHERE t.type = 'expense'`;

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
  );
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
