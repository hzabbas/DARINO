import type { BankAccount, NewBankAccount, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { normalizeSender, sendersMatch } from '../utils/iranianBanks';
import { isPostBalanceAnchor } from './accountRules';
import { notifyDbChange } from './events';

// Balance anchor rules re-exported for unified web and native consumer imports
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
  announce_voice: number;
  is_active: number;
  created_at: string;
  sync_from_ts: number;
  balance_anchor_ts: number;
}

const SELECT_SQL = `SELECT id, bank_code, title, account_number, senders, initial_balance,
  current_balance, include_roundup, announce_voice, is_active, created_at, sync_from_ts, balance_anchor_ts
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
    announceVoice: row.announce_voice === 1,
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
       include_roundup, announce_voice, is_active, created_at, sync_from_ts, balance_anchor_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    input.bank_code,
    title,
    input.account_number?.trim() ? input.account_number.trim() : null,
    JSON.stringify(input.senders ?? []),
    initial,
    current,
    input.include_roundup ? 1 : 0,
    input.announceVoice ? 1 : 0,
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

  // Explicit user balance edit shifts the balance anchor to now
  const balanceChanged =
    input.current_balance !== undefined &&
    Math.trunc(input.current_balance) !== existing.current_balance;
  const anchor =
    input.balance_anchor_ts ?? (balanceChanged ? Date.now() : existing.balance_anchor_ts);

  db.runSync(
    `UPDATE bank_accounts SET
      bank_code = ?, title = ?, account_number = ?, senders = ?,
      initial_balance = ?, current_balance = ?, include_roundup = ?, announce_voice = ?, is_active = ?,
      sync_from_ts = ?, balance_anchor_ts = ?
     WHERE id = ?`,
    input.bank_code ?? existing.bank_code,
    (input.title ?? existing.title).trim() || existing.title,
    input.account_number === undefined ? existing.account_number : input.account_number,
    JSON.stringify(input.senders ?? existing.senders),
    input.initial_balance === undefined ? existing.initial_balance : Math.max(0, Math.trunc(input.initial_balance)),
    input.current_balance === undefined ? existing.current_balance : Math.trunc(input.current_balance),
    (input.include_roundup ?? existing.include_roundup) ? 1 : 0,
    (input.announceVoice ?? existing.announceVoice) ? 1 : 0,
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
 * Updates account balance from bank SMS and moves the anchor forward.
 * Returns true if balance was updated.
 */
export function setAccountBalance(
  db: SqlDatabase,
  id: number,
  balance: number,
  anchorTs: number = Date.now(),
): boolean {
  const account = getBankAccount(db, id);
  if (!account) return false;

  const anchor = Math.trunc(anchorTs);
  // Compare at second-level granularity to prevent dropping same-second SMS
  if (Math.floor(anchor / 1000) < Math.floor(account.balance_anchor_ts / 1000)) return false;

  db.runSync(
    'UPDATE bank_accounts SET current_balance = ?, balance_anchor_ts = ? WHERE id = ?',
    Math.trunc(balance),
    anchor,
    id,
  );
  notifyDbChange();
  return true;
}

/** Adjusts account balance by transaction delta. */
export function adjustAccountBalance(db: SqlDatabase, id: number, delta: number): void {
  db.runSync('UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?', Math.trunc(delta), id);
  notifyDbChange();
}

/** Applies transaction impact if transaction date is on or after anchor. */
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

/** Matches bank account by sender address variants. */
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

/** Earliest sync boundary timestamp across all active accounts. */
export function oldestSyncFrom(db: SqlDatabase): number | null {
  const accounts = listBankAccounts(db, true);
  if (accounts.length === 0) return null;
  return accounts.reduce<number>(
    (oldest, account) => Math.min(oldest, account.sync_from_ts),
    Number.MAX_SAFE_INTEGER,
  );
}

/** Zeroes all account balances. */
export function zeroAllBalances(db: SqlDatabase, anchorTs: number = Date.now()): number {
  const row = db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM bank_accounts');
  db.runSync(
    'UPDATE bank_accounts SET current_balance = 0, initial_balance = 0, balance_anchor_ts = ?',
    Math.trunc(anchorTs),
  );
  return row?.total ?? 0;
}

export interface TotalBalanceBreakdown {
  /** Active bank accounts balance sum */
  bank: number;
  /** Net cash flow from manual unlinked transactions */
  cash: number;
  total: number;
}

/** Total liquid balance = bank account balances + unlinked cash flows */
export function getTotalBalance(db: SqlDatabase): TotalBalanceBreakdown {
  const row = db.getFirstSync<{ bank: number; cash: number }>(
    `SELECT
       (SELECT COALESCE(SUM(current_balance), 0)
          FROM bank_accounts WHERE is_active = 1) AS bank,
       (SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)
          FROM transactions
         WHERE bank_account_id IS NULL
           AND (note IS NULL OR note NOT LIKE '%[opening-bank-balance]%')) AS cash`,
  );

  const bank = Math.trunc(row?.bank ?? 0);
  const cash = Math.trunc(row?.cash ?? 0);
  return { bank, cash, total: bank + cash };
}

