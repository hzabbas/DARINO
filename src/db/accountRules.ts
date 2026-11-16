import type { BankAccount, TransactionType } from '../types/models';
import { parseLocalDate } from '../utils/jalali';

/**
 * Pure bank account rules: balance anchors, sync window options, and transaction deltas.
 */

/** Sync window options for account creation/editing */
export interface SyncWindowOption {
  key: string;
  label: string;
  /** Offset hours from now (0 = from now onwards) */
  hours: number;
}

export const SYNC_WINDOW_OPTIONS: SyncWindowOption[] = [
  { key: 'now', label: 'فقط پیامک‌های جدید (از این لحظه به بعد)', hours: 0 },
  { key: '24h', label: '۲۴ ساعت گذشته', hours: 24 },
  { key: '7d', label: '۷ روز گذشته', hours: 24 * 7 },
];

/** Sync start timestamp for selected window */
export function syncFromForWindow(hours: number, now = Date.now()): number {
  return Math.max(0, Math.trunc(now - Math.max(0, hours) * 60 * 60 * 1000));
}

/** Closest matching option key for stored timestamp */
export function syncWindowKeyFor(syncFromTs: number, now = Date.now()): string {
  const ageHours = Math.max(0, (now - syncFromTs) / (60 * 60 * 1000));
  let best = SYNC_WINDOW_OPTIONS[0];
  for (const option of SYNC_WINDOW_OPTIONS) {
    if (Math.abs(option.hours - ageHours) < Math.abs(best.hours - ageHours)) {
      best = option;
    }
  }
  return best.key;
}

/** Start of local calendar day */
export function startOfLocalDay(value: number | Date | string): number {
  const date = parseLocalDate(value);
  if (!date || Number.isNaN(date.getTime())) return Number.NaN;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Returns true if transaction date is on or after the balance anchor day.
 */
export function isPostBalanceAnchor(account: BankAccount, isoDate: string): boolean {
  const transactionDay = startOfLocalDay(isoDate);
  if (Number.isNaN(transactionDay)) return false;
  return transactionDay >= startOfLocalDay(account.balance_anchor_ts);
}

/** Whether SMS arrival precedes account sync window */
export function isBeforeSyncWindow(account: BankAccount, receivedAt: Date | number): boolean {
  const timestamp = receivedAt instanceof Date ? receivedAt.getTime() : receivedAt;
  if (!Number.isFinite(timestamp)) return false;
  return timestamp < account.sync_from_ts;
}

/** Balance effect: positive for income, negative for expense */
export function balanceEffect(amount: number, type: TransactionType): number {
  return type === 'income' ? Math.trunc(amount) : -Math.trunc(amount);
}
