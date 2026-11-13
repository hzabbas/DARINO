import type { BankAccount, NewBankAccount, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { normalizeSender, sendersMatch } from '../utils/iranianBanks';
import { isPostBalanceAnchor } from './accountRules';
import { notifyDbChange } from './events';

// قواعد خالص «لنگر موجودی و مرز همگام‌سازی» در یک ماژول مشترک‌اند تا نسخه‌ی وب هم
// دقیقاً همان رفتار را داشته باشد. این‌جا دوباره صادر می‌شوند تا مصرف‌کننده‌ها فقط
// یک مسیر import داشته باشند.
export {
  SYNC_WINDOW_OPTIONS,
  balanceEffect,
  isBeforeSyncWindow,
  isPostBalanceAnchor,
  startOfLocalDay,
  syncFromForWindow,
  syncWindowKeyFor,
  type SyncWindowOption,
} from './accountRules';

interface BankAccountRow {
  id: number;
  bank_code: string;
  title: string;
  account_number: string | null;
  senders: string;
  initial_balance: number;
  current_balance: number;
  include_roundup: number;
  is_active: number;
  created_at: string;
  sync_from_ts: number;
  balance_anchor_ts: number;
}

const SELECT_SQL = `SELECT id, bank_code, title, account_number, senders, initial_balance,
  current_balance, include_roundup, is_active, created_at, sync_from_ts, balance_anchor_ts
  FROM bank_accounts`;

function parseSenders(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function mapRow(row: BankAccountRow): BankAccount {
  return {
    id: row.id,
    bank_code: row.bank_code,
    title: row.title,
    account_number: row.account_number,
    senders: parseSenders(row.senders),
    initial_balance: row.initial_balance,
    current_balance: row.current_balance,
    include_roundup: row.include_roundup === 1,
    is_active: row.is_active === 1,
    created_at: row.created_at,
    sync_from_ts: row.sync_from_ts ?? 0,
    balance_anchor_ts: row.balance_anchor_ts ?? 0,
  };
}

export function listBankAccounts(db: SqlDatabase, onlyActive = false): BankAccount[] {
  const rows = db.getAllSync<BankAccountRow>(
    `${SELECT_SQL} ${onlyActive ? 'WHERE is_active = 1' : ''} ORDER BY created_at ASC, id ASC`,
  );
  return rows.map(mapRow);
}

export function getBankAccount(db: SqlDatabase, id: number): BankAccount | null {
  const row = db.getFirstSync<BankAccountRow>(`${SELECT_SQL} WHERE id = ?`, id);
  return row ? mapRow(row) : null;
}

export function createBankAccount(db: SqlDatabase, input: NewBankAccount): number {
  const title = input.title.trim();
  if (!title) {
    throw new Error('نام حساب نمی‌تواند خالی باشد');
  }

  const initial = Math.max(0, Math.trunc(input.initial_balance ?? 0));
  const current = Math.trunc(input.current_balance ?? initial);
  const now = Date.now();

  const result = db.runSync(
    `INSERT INTO bank_accounts
      (bank_code, title, account_number, senders, initial_balance, current_balance,
       include_roundup, is_active, created_at, sync_from_ts, balance_anchor_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    input.bank_code,
    title,
    input.account_number?.trim() ? input.account_number.trim() : null,
    JSON.stringify(input.senders ?? []),
    initial,
    current,
    input.include_roundup ? 1 : 0,
    toLocalIso(new Date()),
    Math.trunc(input.sync_from_ts ?? now),
    Math.trunc(input.balance_anchor_ts ?? now),
  );

  notifyDbChange();
  return result.lastInsertRowId;
}

export function updateBankAccount(
  db: SqlDatabase,
  id: number,
  input: Partial<NewBankAccount> & { is_active?: boolean },
): void {
  const existing = getBankAccount(db, id);
  if (!existing) {
    throw new Error('حساب بانکی پیدا نشد');
  }

  // اگر کاربر موجودی را دستی عوض کند، همان لحظه «لنگر» موجودی می‌شود تا مانده‌ی
  // قطعی جدید مرجع باشد و تراکنش‌های قدیمی دوباره روی آن اعمال نشوند.
  const balanceChanged =
    input.current_balance !== undefined &&
    Math.trunc(input.current_balance) !== existing.current_balance;
  const anchor =
    input.balance_anchor_ts ?? (balanceChanged ? Date.now() : existing.balance_anchor_ts);

  db.runSync(
    `UPDATE bank_accounts SET
      bank_code = ?, title = ?, account_number = ?, senders = ?,
      initial_balance = ?, current_balance = ?, include_roundup = ?, is_active = ?,
      sync_from_ts = ?, balance_anchor_ts = ?
     WHERE id = ?`,
    input.bank_code ?? existing.bank_code,
    (input.title ?? existing.title).trim() || existing.title,
    input.account_number === undefined ? existing.account_number : input.account_number,
    JSON.stringify(input.senders ?? existing.senders),
    input.initial_balance === undefined ? existing.initial_balance : Math.max(0, Math.trunc(input.initial_balance)),
    input.current_balance === undefined ? existing.current_balance : Math.trunc(input.current_balance),
    (input.include_roundup ?? existing.include_roundup) ? 1 : 0,
    (input.is_active ?? existing.is_active) ? 1 : 0,
    Math.trunc(input.sync_from_ts ?? existing.sync_from_ts),
    Math.trunc(anchor),
    id,
  );

  notifyDbChange();
}

export function deleteBankAccount(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM bank_accounts WHERE id = ?', id);
  notifyDbChange();
}

/**
 * موجودی را با مانده‌ی اعلامی بانک هم‌تراز می‌کند و لنگر را به لحظه‌ی همان پیامک
 * می‌برد؛ از این لحظه به بعد این عدد تنها منبع حقیقت است.
 */
export function setAccountBalance(
  db: SqlDatabase,
  id: number,
  balance: number,
  anchorTs: number = Date.now(),
): void {
  db.runSync(
    'UPDATE bank_accounts SET current_balance = ?, balance_anchor_ts = ? WHERE id = ?',
    Math.trunc(balance),
    Math.trunc(anchorTs),
    id,
  );
  notifyDbChange();
}

/** تغییر موجودی به اندازه‌ی یک تراکنش (وقتی پیامک مانده نداشت). */
export function adjustAccountBalance(db: SqlDatabase, id: number, delta: number): void {
  db.runSync('UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?', Math.trunc(delta), id);
  notifyDbChange();
}

/**
 * اعمال اثر یک تراکنش روی موجودی حساب، فقط اگر تراکنش «بعد از لنگر» باشد.
 *
 * خروجی می‌گوید آیا تغییری اعمال شد (برای تست و برای گزارش به UI).
 */
export function applyTransactionDelta(
  db: SqlDatabase,
  accountId: number | null,
  delta: number,
  isoDate: string,
): boolean {
  if (!accountId || !delta) return false;

  const account = getBankAccount(db, accountId);
  if (!account || !isPostBalanceAnchor(account, isoDate)) return false;

  adjustAccountBalance(db, accountId, delta);
  return true;
}

export function totalBankBalance(db: SqlDatabase): number {
  const row = db.getFirstSync<{ total: number }>(
    'SELECT COALESCE(SUM(current_balance), 0) AS total FROM bank_accounts WHERE is_active = 1',
  );
  return row?.total ?? 0;
}

/**
 * حسابی که این فرستنده به آن وصل است.
 *
 * مقایسه با قاعده‌ی یکدست `sendersMatch` انجام می‌شود تا «+989999987641»،
 * «989999987641» و «09999987641» یک حساب را پیدا کنند.
 */
export function findAccountBySender(db: SqlDatabase, sender: string): BankAccount | null {
  if (!normalizeSender(sender)) return null;
  for (const account of listBankAccounts(db, true)) {
    if (account.senders.some((item) => sendersMatch(item, sender))) {
      return account;
    }
  }
  return null;
}

export function allAccountSenders(db: SqlDatabase): string[] {
  return Array.from(new Set(listBankAccounts(db, true).flatMap((account) => account.senders)));
}

/**
 * قدیمی‌ترین مرز همگام‌سازی بین حساب‌های فعال.
 *
 * `useSmsSync` به‌جای یک پنجره‌ی ثابت هفت‌روزه از همین مهر زمانی تاریخچه را
 * می‌خواند؛ نتیجه این‌که حساب تازه‌وصل‌شده صف تایید را با پیامک‌های قدیمی پر نمی‌کند.
 * اگر حساب فعالی نباشد `null` برمی‌گردد.
 */
export function oldestSyncFrom(db: SqlDatabase): number | null {
  const accounts = listBankAccounts(db, true);
  if (accounts.length === 0) return null;
  return accounts.reduce<number>(
    (oldest, account) => Math.min(oldest, account.sync_from_ts),
    Number.MAX_SAFE_INTEGER,
  );
}

/** موجودی همه‌ی حساب‌ها را صفر می‌کند (برای «ریست تراکنش‌ها و موجودی‌ها»). */
export function zeroAllBalances(db: SqlDatabase, anchorTs: number = Date.now()): number {
  const row = db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM bank_accounts');
  db.runSync(
    'UPDATE bank_accounts SET current_balance = 0, initial_balance = 0, balance_anchor_ts = ?',
    Math.trunc(anchorTs),
  );
  return row?.total ?? 0;
}

export interface BankBalanceAccountBreakdown {
  accountId: number;
  title: string;
  currentBalance: number;
  /** درآمدهای بانکی که در لجر ثبت شده‌اند و اگر دوباره در پایه بیایند، دوباره‌شماری می‌شود */
  trackedIncome: number;
  /** هزینه‌های بانکی ثبت‌شده در لجر */
  trackedExpense: number;
  /**
   * «موجودی پایه»: پولی که در تراکنش‌های لجر حضور ندارد.
   * فرمول: current_balance - (trackedIncome - trackedExpense)
   */
  baseBalance: number;
}

export interface BankBalanceBreakdown {
  accounts: BankBalanceAccountBreakdown[];
  /** موجودی فعلی همه‌ی کارت‌های فعال */
  totalActiveBankBalance: number;
  /** موجودی پایه‌ی همه‌ی کارت‌های فعال؛ این است که می‌توان بدون دوباره‌شماری جمع کرد */
  totalBaseBankBalance: number;
}

/**
 * تفکیک «موجودی فعلی» و «موجودی پایه» کارت‌ها.
 *
 * هر تراکنش بانکی‌ای که در لجر هست، هم در درآمد/هزینه‌ی گزارش شمرده می‌شود و هم در
 * موجودی کارت تاثیر دارد (یا از مانده‌ی پیامک آمده یا هنگام ثبت در موجودی رفته).
 * پس **تمام تراکنش‌های بانکیِ وصل‌شده** را از موجودی کم می‌کنیم، نه فقط تراکنش‌های
 * بعد از آخرین لنگر. این تفاوت حیاتی است: عملیات «ثبت موجودی به‌عنوان درآمد»
 * لنگر را جلو می‌برد؛ اگر فقط اثرِ بعد از لنگر کم می‌شد، همان درآمدهای قدیمی دوباره
 * در «پایه» ظاهر می‌شدند و زدن دوباره‌ی دکمه مبلغ را باد می‌کرد.
 *
 * با این فرمول: اگر موجودی اولیه ۵۰۰ هزار باشد و ۱۰۰ هزار درآمد بانکی ثبت شود،
 * موجودی ۶۰۰ و پایه ۵۰۰ می‌ماند (به‌مقدار درآمد کم نشده، فقط موجودی زیاد شده).
 */
export function getBankBalanceBreakdown(db: SqlDatabase, onlyActive = true): BankBalanceBreakdown {
  const rows = db.getAllSync<{
    accountId: number;
    title: string;
    currentBalance: number;
    trackedIncome: number;
    trackedExpense: number;
  }>(
    `SELECT
       ba.id AS accountId,
       ba.title AS title,
       ba.current_balance AS currentBalance,
       COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS trackedIncome,
       COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS trackedExpense
     FROM bank_accounts ba
     LEFT JOIN transactions t ON t.bank_account_id = ba.id
     ${onlyActive ? 'WHERE ba.is_active = 1' : ''}
     GROUP BY ba.id, ba.title, ba.current_balance
     ORDER BY ba.id`,
  );

  const accounts = rows.map((row) => ({
    accountId: row.accountId,
    title: row.title,
    currentBalance: Math.trunc(row.currentBalance),
    trackedIncome: Math.trunc(row.trackedIncome),
    trackedExpense: Math.trunc(row.trackedExpense),
    baseBalance:
      Math.trunc(row.currentBalance) -
      (Math.trunc(row.trackedIncome) - Math.trunc(row.trackedExpense)),
  }));

  return {
    accounts,
    totalActiveBankBalance: accounts.reduce((sum, account) => sum + account.currentBalance, 0),
    totalBaseBankBalance: accounts.reduce((sum, account) => sum + account.baseBalance, 0),
  };
}

/** همه‌ی حساب‌های فعال را روی «همین لحظه» لنگر می‌زند (پس از ثبت موجودی پایه). */
export function reanchorActiveAccounts(db: SqlDatabase, anchorTs: number): number {
  const result = db.runSync(
    'UPDATE bank_accounts SET balance_anchor_ts = ? WHERE is_active = 1',
    Math.trunc(anchorTs),
  );
  notifyDbChange();
  return result.changes;
}

