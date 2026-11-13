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

// اثر تراکنش روی موجودی یک قاعده‌ی واحد است؛ این‌جا هم دوباره صادر می‌شود تا
// مصرف‌کننده‌ها یک مسیر import داشته باشند.
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

/** فیلترهای ترکیبی لیست تراکنش‌ها (بازه + نوع + وصل‌بودن به حساب بانکی). */
export interface TransactionListFilter {
  range?: DateRange | null;
  type?: TransactionType | 'all';
  /** `linked` = تراکنش بانکی، `manual` = تراکنش دستی، `any` = هر دو */
  bankLink?: 'any' | 'linked' | 'manual';
}

/**
 * شرط بازه‌ی زمانی؛ برای بازه‌ی null هیچ شرطی اضافه نمی‌شود (کل زمان‌ها).
 * تاریخ‌ها ISO محلی و بدون منطقه‌ی زمانی‌اند، پس مقایسه‌ی متنی دقیق است.
 */
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

/**
 * برگرداندن اثر یک تراکنش از موجودی حسابش.
 *
 * عمداً بدون بررسی لنگر صدا زده می‌شود: کسی که این را صدا می‌زند قبلاً مطمئن شده
 * که اثر همان تراکنش روی موجودی اعمال شده بود (وگرنه چیزی برای برگرداندن نیست).
 */
function reverseTransactionEffect(db: SqlDatabase, transaction: Transaction): void {
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

/**
 * ثبت تراکنش جدید.
 *
 * نکته‌ی طراحی: «موجودی کل حساب‌های بانکی» و «سود خالص دوره» دو چیز جدا هستند.
 * موجودی حساب فقط از مانده‌ی اعلامی بانک یا از تغییرات بعد از لنگر موجودی عوض
 * می‌شود؛ پس گردش‌های دوره‌ای هرگز به‌عنوان درآمد در مانده‌ی اولیه ظاهر نمی‌شوند و
 * ثبت دستی تراکنش هم درآمد نمی‌سازد.
 *
 * اگر تراکنش به یک حساب وصل باشد و تاریخش بعد از لنگر آن حساب باشد، اثرش روی
 * موجودی همان حساب اعمال می‌شود؛ در غیر این صورت فقط در دفتر کل ثبت می‌شود.
 * نوشتن داخل یک تراکنش دیتابیس انجام می‌شود تا نیمه‌کاره نماند و اعلان تغییر
 * (که باعث تازه‌شدن همه‌ی صفحه‌ها می‌شود) همیشه بعد از کامیت ارسال شود.
 */
export function createTransaction(db: SqlDatabase, input: NewTransaction): number {
  const amount = assertValidTransaction(input);
  const note = input.note?.trim() ? input.note.trim() : null;
  const accountId = input.bank_account_id ?? null;

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

    applyTransactionDelta(db, accountId, balanceEffect(amount, input.type), input.date);
  });

  notifyDbChange();
  return insertedId;
}

/**
 * ویرایش تراکنش؛ تاریخ ثبت اصلی و created_at دست‌نخورده می‌مانند.
 *
 * اثر قبلی روی حساب قبلی برگردانده می‌شود و اثر جدید روی حساب جدید اعمال می‌شود؛
 * هر دو در یک تراکنش دیتابیس تا موجودی هیچ‌وقت یک‌طرفه جابه‌جا نشود.
 */
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

/** حذف تراکنش؛ اثرش روی موجودی حساب هم برگردانده می‌شود. */
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
  /** فاصله‌ی زمانی با تراکنش مبنا، به ساعت */
  hoursApart: number;
}

/**
 * تراکنش‌های مشابه یک پیامک/تراکنش تازه: همان مبلغ و همان نوع، در پنجره‌ی زمانی
 * پیش‌فرض ۳۶ ساعت. برای جلوگیری از ثبت دوباره‌ی هزینه‌ای که کاربر دستی وارد کرده.
 */
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

/** تراکنش‌های یک بازه، از جدیدترین به قدیمی‌ترین. limit منفی یعنی بدون محدودیت. */
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
