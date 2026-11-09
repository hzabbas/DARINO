import type {
  CategoryTotal,
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

export function createTransaction(db: SqlDatabase, input: NewTransaction): number {
  const amount = Math.trunc(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('مبلغ تراکنش باید بزرگ‌تر از صفر باشد');
  }
  if (!input.category_id) {
    throw new Error('دسته‌بندی تراکنش انتخاب نشده است');
  }

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

export function deleteTransaction(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM transactions WHERE id = ?', id);
}

export function listRecentTransactions(db: SqlDatabase, limit = 8): TransactionWithCategory[] {
  return db.getAllSync<TransactionWithCategory>(
    `${TRANSACTION_WITH_CATEGORY_SQL}
     ORDER BY t.date DESC, t.id DESC
     LIMIT ?`,
    limit,
  );
}

export function listTransactionsBetween(
  db: SqlDatabase,
  startIso: string,
  endIso: string,
): TransactionWithCategory[] {
  return db.getAllSync<TransactionWithCategory>(
    `${TRANSACTION_WITH_CATEGORY_SQL}
     WHERE t.date >= ? AND t.date < ?
     ORDER BY t.date DESC, t.id DESC`,
    startIso,
    endIso,
  );
}

export function getTransaction(db: SqlDatabase, id: number): Transaction | null {
  return db.getFirstSync<Transaction>(
    'SELECT id, amount, type, category_id, date, shamsi_date, note, created_at FROM transactions WHERE id = ?',
    id,
  );
}

/** جمع درآمد و هزینه در یک بازه‌ی زمانی (پایان غیرشامل). */
export function getMonthlySummary(db: SqlDatabase, startIso: string, endIso: string): MonthlySummary {
  const row = db.getFirstSync<{ income: number; expense: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions
     WHERE date >= ? AND date < ?`,
    startIso,
    endIso,
  );

  const income = row?.income ?? 0;
  const expense = row?.expense ?? 0;
  return { income, expense, balance: income - expense };
}

/** جمع هزینه‌ها به تفکیک دسته‌بندی، مرتب‌شده از بیشترین به کمترین. */
export function getExpenseByCategory(
  db: SqlDatabase,
  startIso: string,
  endIso: string,
): CategoryTotal[] {
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
     WHERE t.type = 'expense' AND t.date >= ? AND t.date < ?
     GROUP BY t.category_id
     ORDER BY total DESC`,
    startIso,
    endIso,
  );
}

export function countTransactions(db: SqlDatabase): number {
  const row = db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM transactions');
  return row?.total ?? 0;
}
