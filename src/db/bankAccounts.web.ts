import type { BankAccount, NewBankAccount, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { normalizeSender, sendersMatch } from '../utils/iranianBanks';
import { isPostBalanceAnchor } from './accountRules';
import { notifyDbChange } from './events';
import { getWebStore, persistWebStore } from './store.web';

// قواعد خالص «لنگر موجودی و مرز همگام‌سازی» مشترک با نسخه‌ی SQLite است؛ این‌جا
// دوباره صادر می‌شود تا فرم حساب بانکی در وب هم فقط یک مسیر import داشته باشد.
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

export function listBankAccounts(_db: SqlDatabase, onlyActive = false): BankAccount[] {
  const accounts = getWebStore().bankAccounts;
  return (onlyActive ? accounts.filter((account) => account.is_active) : accounts).slice();
}

export function getBankAccount(_db: SqlDatabase, id: number): BankAccount | null {
  return getWebStore().bankAccounts.find((account) => account.id === id) ?? null;
}

export function createBankAccount(_db: SqlDatabase, input: NewBankAccount): number {
  const store = getWebStore();
  const title = input.title.trim();
  if (!title) throw new Error('نام حساب نمی‌تواند خالی باشد');

  const initial = Math.max(0, Math.trunc(input.initial_balance ?? 0));
  const now = Date.now();
  const account: BankAccount = {
    id: store.nextBankAccountId,
    bank_code: input.bank_code,
    title,
    account_number: input.account_number?.trim() ? input.account_number.trim() : null,
    senders: input.senders ?? [],
    initial_balance: initial,
    current_balance: Math.trunc(input.current_balance ?? initial),
    include_roundup: Boolean(input.include_roundup),
    is_active: true,
    created_at: toLocalIso(new Date()),
    sync_from_ts: Math.trunc(input.sync_from_ts ?? now),
    balance_anchor_ts: Math.trunc(input.balance_anchor_ts ?? now),
  };

  store.bankAccounts = [...store.bankAccounts, account];
  store.nextBankAccountId += 1;
  persistWebStore();
  notifyDbChange();
  return account.id;
}

export function updateBankAccount(
  _db: SqlDatabase,
  id: number,
  input: Partial<NewBankAccount> & { is_active?: boolean },
): void {
  const store = getWebStore();
  const index = store.bankAccounts.findIndex((account) => account.id === id);
  if (index === -1) throw new Error('حساب بانکی پیدا نشد');

  const existing = store.bankAccounts[index];

  // موجودی که دستی عوض شود، همان لحظه لنگر می‌شود؛ پس مانده‌ی قطعی جدید مرجع است و
  // تراکنش‌های قدیمی دوباره روی آن اعمال نمی‌شوند.
  const balanceChanged =
    input.current_balance !== undefined &&
    Math.trunc(input.current_balance) !== existing.current_balance;
  const anchor =
    input.balance_anchor_ts ?? (balanceChanged ? Date.now() : existing.balance_anchor_ts);

  const next: BankAccount = {
    ...existing,
    bank_code: input.bank_code ?? existing.bank_code,
    title: (input.title ?? existing.title).trim() || existing.title,
    account_number: input.account_number === undefined ? existing.account_number : input.account_number,
    senders: input.senders ?? existing.senders,
    initial_balance:
      input.initial_balance === undefined ? existing.initial_balance : Math.max(0, Math.trunc(input.initial_balance)),
    current_balance:
      input.current_balance === undefined ? existing.current_balance : Math.trunc(input.current_balance),
    include_roundup: input.include_roundup ?? existing.include_roundup,
    is_active: input.is_active ?? existing.is_active,
    sync_from_ts: Math.trunc(input.sync_from_ts ?? existing.sync_from_ts),
    balance_anchor_ts: Math.trunc(anchor),
  };

  store.bankAccounts = store.bankAccounts.map((account) => (account.id === id ? next : account));
  persistWebStore();
  notifyDbChange();
}

export function deleteBankAccount(_db: SqlDatabase, id: number): void {
  const store = getWebStore();
  store.bankAccounts = store.bankAccounts.filter((account) => account.id !== id);
  store.pendingSms = store.pendingSms.map((item) =>
    item.bank_account_id === id ? { ...item, bank_account_id: null } : item,
  );
  // تراکنش‌های بانکی همین حساب هم بی‌حساب می‌شوند (عیناً ON DELETE SET NULL)
  store.transactions = store.transactions.map((transaction) =>
    transaction.bank_account_id === id ? { ...transaction, bank_account_id: null } : transaction,
  );
  persistWebStore();
  notifyDbChange();
}

/** موجودی را با مانده‌ی اعلامی بانک هم‌تراز می‌کند و لنگر را جلو می‌برد. */
export function setAccountBalance(
  _db: SqlDatabase,
  id: number,
  balance: number,
  anchorTs: number = Date.now(),
): boolean {
  const store = getWebStore();
  const account = store.bankAccounts.find((item) => item.id === id);
  if (!account) return false;

  const anchor = Math.trunc(anchorTs);
  // فقط مانده‌ی تازه‌تر از آخرین لنگر؛ مانده‌ی قدیمی‌تر نباید موجودی را عقب ببرد.
  // مقایسه در دقت ثانیه است، مثل تاریخ‌های ذخیره‌شده.
  if (Math.floor(anchor / 1000) < Math.floor(account.balance_anchor_ts / 1000)) return false;

  store.bankAccounts = store.bankAccounts.map((item) =>
    item.id === id
      ? { ...item, current_balance: Math.trunc(balance), balance_anchor_ts: anchor }
      : item,
  );
  persistWebStore();
  notifyDbChange();
  return true;
}

export function adjustAccountBalance(_db: SqlDatabase, id: number, delta: number): void {
  const store = getWebStore();
  store.bankAccounts = store.bankAccounts.map((account) =>
    account.id === id ? { ...account, current_balance: account.current_balance + Math.trunc(delta) } : account,
  );
  persistWebStore();
  notifyDbChange();
}

/**
 * اعمال اثر یک تراکنش روی موجودی حساب، فقط اگر تراکنش «بعد از لنگر» باشد.
 * خروجی می‌گوید آیا تغییری اعمال شد.
 */
export function applyTransactionDelta(
  _db: SqlDatabase,
  accountId: number | null,
  delta: number,
  isoDate: string,
): boolean {
  if (!accountId || !delta) return false;

  const account = getBankAccount(_db, accountId);
  if (!account || !isPostBalanceAnchor(account, isoDate)) return false;

  adjustAccountBalance(_db, accountId, delta);
  return true;
}

export function totalBankBalance(_db: SqlDatabase): number {
  return getWebStore()
    .bankAccounts.filter((account) => account.is_active)
    .reduce((sum, account) => sum + account.current_balance, 0);
}

/** همان قاعده‌ی نسخه‌ی SQLite: سرشماره‌ها با نرمال‌سازی یکدست مقایسه می‌شوند. */
export function findAccountBySender(_db: SqlDatabase, sender: string): BankAccount | null {
  if (!normalizeSender(sender)) return null;
  return (
    getWebStore().bankAccounts.find((account) =>
      account.senders.some((item) => sendersMatch(item, sender)),
    ) ?? null
  );
}

export function allAccountSenders(_db: SqlDatabase): string[] {
  return Array.from(new Set(getWebStore().bankAccounts.flatMap((account) => account.senders)));
}

/** قدیمی‌ترین مرز همگام‌سازی بین حساب‌های فعال (null = حساب فعالی نیست). */
export function oldestSyncFrom(_db: SqlDatabase): number | null {
  const accounts = getWebStore().bankAccounts.filter((account) => account.is_active);
  if (accounts.length === 0) return null;
  return accounts.reduce<number>(
    (oldest, account) => Math.min(oldest, account.sync_from_ts),
    Number.MAX_SAFE_INTEGER,
  );
}

/** موجودی همه‌ی حساب‌ها را صفر می‌کند (برای «ریست تراکنش‌ها و موجودی‌ها»). */
export function zeroAllBalances(_db: SqlDatabase, anchorTs: number = Date.now()): number {
  const store = getWebStore();
  const count = store.bankAccounts.length;
  store.bankAccounts = store.bankAccounts.map((account) => ({
    ...account,
    current_balance: 0,
    initial_balance: 0,
    balance_anchor_ts: Math.trunc(anchorTs),
  }));
  return count;
}

export interface TotalBalanceBreakdown {
  bank: number;
  cash: number;
  total: number;
}

/**
 * همان تعریف نسخه‌ی SQLite: موجودی کارت‌ها + جریان خالص تراکنش‌های بدون حساب.
 * ردیف‌های افتتاحیه‌ی نسخه‌ی قبل نادیده گرفته می‌شوند تا دوباره‌شماری نشوند.
 */
export function getTotalBalance(_db: SqlDatabase): TotalBalanceBreakdown {
  const store = getWebStore();
  const bank = store.bankAccounts
    .filter((account) => account.is_active)
    .reduce((sum, account) => sum + Math.trunc(account.current_balance), 0);

  const cash = store.transactions
    .filter(
      (transaction) =>
        transaction.bank_account_id === null &&
        !(transaction.note ?? '').includes('[opening-bank-balance]'),
    )
    .reduce(
      (sum, transaction) =>
        sum + (transaction.type === 'income' ? Math.trunc(transaction.amount) : -Math.trunc(transaction.amount)),
      0,
    );

  return { bank, cash, total: bank + cash };
}

