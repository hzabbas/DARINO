import type { BankAccount, NewBankAccount, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { normalizeSender, sendersMatch } from '../utils/iranianBanks';
import { notifyDbChange } from './events';

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
}

const SELECT_SQL = `SELECT id, bank_code, title, account_number, senders, initial_balance,
  current_balance, include_roundup, is_active, created_at FROM bank_accounts`;

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

  const result = db.runSync(
    `INSERT INTO bank_accounts
      (bank_code, title, account_number, senders, initial_balance, current_balance, include_roundup, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    input.bank_code,
    title,
    input.account_number?.trim() ? input.account_number.trim() : null,
    JSON.stringify(input.senders ?? []),
    initial,
    current,
    input.include_roundup ? 1 : 0,
    toLocalIso(new Date()),
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

  db.runSync(
    `UPDATE bank_accounts SET
      bank_code = ?, title = ?, account_number = ?, senders = ?,
      initial_balance = ?, current_balance = ?, include_roundup = ?, is_active = ?
     WHERE id = ?`,
    input.bank_code ?? existing.bank_code,
    (input.title ?? existing.title).trim() || existing.title,
    input.account_number === undefined ? existing.account_number : input.account_number,
    JSON.stringify(input.senders ?? existing.senders),
    input.initial_balance === undefined ? existing.initial_balance : Math.max(0, Math.trunc(input.initial_balance)),
    input.current_balance === undefined ? existing.current_balance : Math.trunc(input.current_balance),
    (input.include_roundup ?? existing.include_roundup) ? 1 : 0,
    (input.is_active ?? existing.is_active) ? 1 : 0,
    id,
  );

  notifyDbChange();
}

export function deleteBankAccount(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM bank_accounts WHERE id = ?', id);
  notifyDbChange();
}

/** موجودی را با مقدار خوانده‌شده از پیامک هم‌تراز می‌کند. */
export function setAccountBalance(db: SqlDatabase, id: number, balance: number): void {
  db.runSync('UPDATE bank_accounts SET current_balance = ? WHERE id = ?', Math.trunc(balance), id);
  notifyDbChange();
}

/** تغییر موجودی به اندازه‌ی یک تراکنش (وقتی پیامک مانده نداشت). */
export function adjustAccountBalance(db: SqlDatabase, id: number, delta: number): void {
  db.runSync('UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?', Math.trunc(delta), id);
  notifyDbChange();
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
