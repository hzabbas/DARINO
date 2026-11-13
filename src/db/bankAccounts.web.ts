import type { BankAccount, NewBankAccount, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { normalizeSender, sendersMatch } from '../utils/iranianBanks';
import { notifyDbChange } from './events';
import { getWebStore, persistWebStore } from './store.web';

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
  persistWebStore();
  notifyDbChange();
}

export function setAccountBalance(_db: SqlDatabase, id: number, balance: number): void {
  const store = getWebStore();
  store.bankAccounts = store.bankAccounts.map((account) =>
    account.id === id ? { ...account, current_balance: Math.trunc(balance) } : account,
  );
  persistWebStore();
  notifyDbChange();
}

export function adjustAccountBalance(_db: SqlDatabase, id: number, delta: number): void {
  const store = getWebStore();
  store.bankAccounts = store.bankAccounts.map((account) =>
    account.id === id ? { ...account, current_balance: account.current_balance + Math.trunc(delta) } : account,
  );
  persistWebStore();
  notifyDbChange();
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
