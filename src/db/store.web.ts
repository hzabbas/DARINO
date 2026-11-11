import type { Category, Transaction } from '../types/models';
import { DEFAULT_CATEGORIES } from './seed';

/**
 * دیتابیس نمایشی وب.
 *
 * روی اندروید/آی‌اواس از SQLite واقعی استفاده می‌شود؛ اما نسخه‌ی وب برای توسعه
 * و پیش‌نمایش، داده‌ها را در حافظه و localStorage نگه می‌دارد تا نیازی به
 * wa-sqlite و هدرهای SharedArrayBuffer نباشد.
 */
const STORAGE_KEY = 'darino.web.v1';

export interface WebStoreState {
  categories: Category[];
  transactions: Transaction[];
  settings: Record<string, string>;
  nextCategoryId: number;
  nextTransactionId: number;
}

let state: WebStoreState | null = null;

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // در حالت ناشناس برخی مرورگرها دسترسی به localStorage خطا می‌دهد
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
  const transactions = value.transactions.filter(isTransaction);
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

  return {
    categories,
    transactions,
    settings,
    nextCategoryId: Math.max(Number(value.nextCategoryId) || 1, maxCategoryId + 1),
    nextTransactionId: Math.max(Number(value.nextTransactionId) || 1, maxTransactionId + 1),
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
    nextCategoryId: categories.length + 1,
    nextTransactionId: 1,
  };
}

export function persistWebStore(): void {
  if (!state) {
    return;
  }
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // اگر ذخیره نشد، نسخه‌ی درون‌حافظه‌ای همچنان کار می‌کند
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
      // داده‌ی ذخیره‌شده خراب است؛ از نو می‌سازیم
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

/** پاک کردن کامل دیتابیس نمایشی (برای تست‌ها و شروع از نو). */
export function resetWebStore(): void {
  state = null;
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // نادیده بگیر
  }
}
