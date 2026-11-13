import type { BankAccount, TransactionType } from '../types/models';

/**
 * قواعد خالص «موجودی و لنگر» حساب بانکی.
 *
 * این ماژول هیچ وابستگی‌ای به لایه‌ی ذخیره‌سازی ندارد تا هم نسخه‌ی SQLite و هم
 * نسخه‌ی وب (`bankAccounts.web.ts`) و هم تست‌ها از یک قاعده‌ی واحد استفاده کنند.
 */

/** گزینه‌های «از چه زمانی پیامک‌ها خوانده شوند» در فرم حساب بانکی. */
export interface SyncWindowOption {
  key: string;
  label: string;
  /** چند ساعت قبل از همین لحظه؛ صفر یعنی «از این لحظه به بعد» */
  hours: number;
}

export const SYNC_WINDOW_OPTIONS: SyncWindowOption[] = [
  { key: 'now', label: 'فقط پیامک‌های جدید (از این لحظه به بعد)', hours: 0 },
  { key: '24h', label: '۲۴ ساعت گذشته', hours: 24 },
  { key: '7d', label: '۷ روز گذشته', hours: 24 * 7 },
];

/** مهر زمانی شروع همگام‌سازی برای یک بازه‌ی انتخابی. */
export function syncFromForWindow(hours: number, now = Date.now()): number {
  return Math.max(0, Math.trunc(now - Math.max(0, hours) * 60 * 60 * 1000));
}

/**
 * نزدیک‌ترین گزینه‌ی بازه به یک مهر زمانی ذخیره‌شده.
 * برای این‌که وقتی حساب را دوباره باز می‌کنیم، همان گزینه‌ای که کاربر انتخاب کرده
 * بود انتخاب بماند.
 */
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

/** ابتدای روز محلی؛ مقایسه‌ی «هم‌روز یا بعدتر» با همین سنجیده می‌شود. */
export function startOfLocalDay(value: number | Date): number {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return Number.NaN;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * آیا تاریخ این تراکنش «بعد از لنگر موجودی» حساب است؟
 *
 * مقایسه در سطح روز انجام می‌شود، نه میلی‌ثانیه: کاربری که امروز حساب بانکی‌اش را
 * وصل می‌کند و بعد هزینه‌ی همین صبح را دستی ثبت می‌کند، باید همان هزینه در موجودی
 * لحاظ شود؛ ولی تراکنش‌های روزهای قبل (که بانک در «مانده» لحاظشان کرده) دوباره
 * شمرده نمی‌شوند.
 */
export function isPostBalanceAnchor(account: BankAccount, isoDate: string): boolean {
  const transactionDay = startOfLocalDay(new Date(isoDate));
  if (Number.isNaN(transactionDay)) return false;
  return transactionDay >= startOfLocalDay(account.balance_anchor_ts);
}

/** آیا این پیامک قبل از مرز همگام‌سازی حساب رسیده است؟ (نباید وارد صف شود) */
export function isBeforeSyncWindow(account: BankAccount, receivedAt: Date | number): boolean {
  const timestamp = receivedAt instanceof Date ? receivedAt.getTime() : receivedAt;
  if (!Number.isFinite(timestamp)) return false;
  return timestamp < account.sync_from_ts;
}

/** اثر یک تراکنش روی موجودی: درآمد مثبت، هزینه منفی. */
export function balanceEffect(amount: number, type: TransactionType): number {
  return type === 'income' ? Math.trunc(amount) : -Math.trunc(amount);
}
