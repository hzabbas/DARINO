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
import { notifyDbChange } from './events';
import { runInTransaction } from './transaction';

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

/**
 * ثبت تراکنش جدید.
 *
 * نکته‌ی طراحی: تراکنش‌های دفتر کل به هیچ حسابی وصل نیستند (`transactions` ستون
 * `bank_account_id` ندارد) و موجودی حساب بانکی فقط از «مانده»ی پیامک بانک یا در
 * لحظه‌ی تایید پیامک هم‌تراز می‌شود. پس ثبت/ویرایش/حذف تراکنش دستی نباید موجودی
 * حساب را تغییر بدهد و این‌جا هیچ جبرانی روی موجودی انجام نمی‌شود.
 * نوشتن داخل یک تراکنش دیتابیس انجام می‌شود تا نیمه‌کاره نماند و اعلان تغییر
 * (که باعث تازه‌شدن همه‌ی صفحه‌ها می‌شود) همیشه بعد از کامیت ارسال شود.
 */
export function createTransaction(db: SqlDatabase, input: NewTransaction): number {
  const amount = assertValidTransaction(input);
  const note = input.note?.trim() ? input.note.trim() : null;

  let insertedId = 0;

  runInTransaction(db, () => {
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
    insertedId = result.lastInsertRowId;
  });

  notifyDbChange();
  return insertedId;
}

/** ویرایش تراکنش؛ تاریخ ثبت اصلی و created_at دست‌نخورده می‌مانند. */
export function updateTransaction(db: SqlDatabase, id: number, input: NewTransaction): void {
  const amount = assertValidTransaction(input);
  const note = input.note?.trim() ? input.note.trim() : null;

  runInTransaction(db, () => {
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
  });

  notifyDbChange();
}

export function deleteTransaction(db: SqlDatabase, id: number): void {
  runInTransaction(db, () => {
    db.runSync('DELETE FROM transactions WHERE id = ?', id);
  });

  notifyDbChange();
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

/** جمع تراکنش‌ها به تفکیک دسته‌بندی برای یک نوع (هزینه یا درآمد)، از بیشترین به کمترین. */
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
