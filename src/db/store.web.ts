import type { BankAccount, Category, PendingSms, Transaction } from '../types/models';
import { DEFAULT_CATEGORIES } from './seed';

/**
 * Web mock in-memory and localStorage store for preview and tests.
 */
const STORAGE_KEY = 'darino.web.v1';

export interface WebStoreState {
  categories: Category[];
  transactions: Transaction[];
  settings: Record<string, string>;
  bankAccounts: BankAccount[];
  pendingSms: PendingSms[];
  nextCategoryId: number;
  nextTransactionId: number;
  nextBankAccountId: number;
  nextPendingSmsId: number;
}

let state: WebStoreState | null = null;

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // Private mode in some browsers restricts localStorage.
  }
  return null;
}

function isCategory(value: unknown): value is Category {
  const row = value as Category | null;
  return Boolean(
    row &&
      typeof row.id === 'number' &&
      typeof row.name === 'string' &&
      (row.type === 'income' || row.type === 'expense') &&
      typeof row.icon === 'string' &&
      typeof row.color === 'string',
  );
}

function isTransaction(value: unknown): value is Transaction {
  const row = value as Transaction | null;
  return Boolean(
    row &&
      typeof row.id === 'number' &&
      typeof row.amount === 'number' &&
      (row.type === 'income' || row.type === 'expense') &&
      typeof row.date === 'string' &&
      typeof row.shamsi_date === 'string',
  );
}

function sanitize(raw: unknown): WebStoreState | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const value = raw as Partial<WebStoreState>;
  if (!Array.isArray(value.categories) || !Array.isArray(value.transactions)) {
    return null;
  }

  const categories = value.categories.filter(isCategory);
  // Ensure legacy data sets bank_account_id properly.
  const transactions = value.transactions.filter(isTransaction).map((item) => ({
    ...item,
    bank_account_id: typeof item.bank_account_id === 'number' ? item.bank_account_id : null,
  }));
  const maxCategoryId = categories.reduce((max, item) => Math.max(max, item.id), 0);
  const maxTransactionId = transactions.reduce((max, item) => Math.max(max, item.id), 0);

  const settings: Record<string, string> = {};
  if (value.settings && typeof value.settings === 'object') {
    for (const [key, item] of Object.entries(value.settings)) {
      if (typeof item === 'string') {
        settings[key] = item;
      }
    }
  }

  const bankAccounts = Array.isArray(value.bankAccounts)
    ? value.bankAccounts
        .filter(
          (item) => item && typeof item.id === 'number' && typeof item.bank_code === 'string' && typeof item.title === 'string',
        )
        .map((item) => ({
          ...item,
          senders: Array.isArray(item.senders) ? item.senders : [],
          include_roundup: Boolean(item.include_roundup),
          announceVoice: Boolean(item.announceVoice ?? (item as { announce_voice?: unknown }).announce_voice),
          is_active: item.is_active !== false,
          // Legacy accounts default sync window to current timestamp.
          sync_from_ts: Number.isFinite(item.sync_from_ts) ? item.sync_from_ts : Date.now(),
          balance_anchor_ts: Number.isFinite(item.balance_anchor_ts) ? item.balance_anchor_ts : Date.now(),
        }))
    : [];
  const pendingSms = Array.isArray(value.pendingSms)
    ? value.pendingSms.filter(
        (item) => item && typeof item.id === 'number' && typeof item.sms_id === 'string' && typeof item.amount === 'number',
      )
    : [];

  const maxBankId = bankAccounts.reduce((max, item) => Math.max(max, item.id), 0);
  const maxPendingId = pendingSms.reduce((max, item) => Math.max(max, item.id), 0);

  return {
    categories,
    transactions,
    settings,
    bankAccounts,
    pendingSms,
    nextCategoryId: Math.max(Number(value.nextCategoryId) || 1, maxCategoryId + 1),
    nextTransactionId: Math.max(Number(value.nextTransactionId) || 1, maxTransactionId + 1),
    nextBankAccountId: Math.max(Number(value.nextBankAccountId) || 1, maxBankId + 1),
    nextPendingSmsId: Math.max(Number(value.nextPendingSmsId) || 1, maxPendingId + 1),
  };
}

function seedState(): WebStoreState {
  const categories = DEFAULT_CATEGORIES.map((category, index) => ({
    id: index + 1,
    ...category,
  }));

  return {
    categories,
    transactions: [],
    settings: {},
    bankAccounts: [],
    pendingSms: [],
    nextCategoryId: categories.length + 1,
    nextTransactionId: 1,
    nextBankAccountId: 1,
    nextPendingSmsId: 1,
  };
}

export function persistWebStore(): void {
  if (!state) {
    return;
  }
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // In-memory fallback if persistence fails.
  }
}

export function getWebStore(): WebStoreState {
  if (state) {
    return state;
  }

  const stored = getStorage()?.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = sanitize(JSON.parse(stored));
      if (parsed) {
        state = parsed;
        return state;
      }
    } catch {
      // Re-seed if stored data is corrupted.
    }
  }

  state = seedState();
  persistWebStore();
  return state;
}

export function replaceWebStore(next: WebStoreState): void {
  state = next;
  persistWebStore();
}

/** Clear pending SMS queue (testing / mock). */
export function clearPendingSms(): void {
  const store = getWebStore();
  store.pendingSms = [];
  persistWebStore();
}

/** Reset web store in memory and storage. */
export function resetWebStore(): void {
  state = null;
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage remove errors.
  }
}
