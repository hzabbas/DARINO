import type { SqlDatabase } from '../types/models';

/**
 * یک کانال ساده‌ی رویداد برای «دیتابیس عوض شد».
 *
 * repositoryها بعد از هر نوشتن، `notifyDbChange()` را صدا می‌زنند و
 * DatabaseProvider با شمارنده‌ی revision همه‌ی کوئری‌های فعال را تازه می‌کند.
 * این کار باعث می‌شود تب‌های دیگر بدون فوکوس دوباره هم به‌روز شوند.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * شنونده‌های «ادغام‌شده».
 *
 * در عملیات دسته‌ای (همگام‌سازی انبوه پیامک، بازیابی پشتیبان) ده‌ها بار پشت سر هم
 * `notifyDbChange()` صدا زده می‌شود. اگر هر بار بلافاصله کوئری‌ها تازه شوند، هر
 * صفحه ده‌ها بار دوباره رندر می‌شود. این شنونده‌ها با یک تأخیر کوتاه و «ریست
 * شدن با هر رویداد تازه» فقط یک بار، بعد از پایان انفجار رویدادها، صدا زده می‌شوند.
 */
const coalescedListeners = new Set<Listener>();

/** فاصله‌ی ادغام؛ به‌قدری کوتاه که کاربر تأخیر را حس نکند. */
export const DB_CHANGE_COALESCE_MS = 60;

let coalesceTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeDbChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** نسخه‌ی ادغام‌شده‌ی `subscribeDbChange`؛ برای دیتابیس‌های پرنوشت. */
export function subscribeDbChangeCoalesced(listener: Listener): () => void {
  coalescedListeners.add(listener);
  return () => {
    coalescedListeners.delete(listener);
  };
}

function scheduleCoalescedFlush(): void {
  if (coalesceTimer !== null) {
    clearTimeout(coalesceTimer);
  }
  coalesceTimer = setTimeout(flushDbChangeCoalesced, DB_CHANGE_COALESCE_MS);
}

/** رویدادهای ادغام‌شده را همین حالا اجرا می‌کند (برای تست و خروج از برنامه). */
export function flushDbChangeCoalesced(): void {
  if (coalesceTimer !== null) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }

  // لیست کپی می‌شود تا شنونده‌ای که خودش را حذف می‌کند مشکلی نسازد
  for (const listener of [...coalescedListeners]) {
    try {
      listener();
    } catch {
      // یک شنونده‌ی خراب نباید بقیه را متوقف کند
    }
  }
}

/** آیا رویداد ادغام‌شده‌ای در انتظار اجراست؟ (برای تست) */
export function hasPendingDbChangeFlush(): boolean {
  return coalesceTimer !== null;
}

export function notifyDbChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // یک شنونده‌ی خراب نباید بقیه را متوقف کند
    }
  });

  scheduleCoalescedFlush();
}

/** برای تست‌ها: همه‌ی شنونده‌ها و تایمرهای در انتظار را پاک می‌کند. */
export function resetDbChangeListeners(): void {
  listeners.clear();
  coalescedListeners.clear();
  if (coalesceTimer !== null) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
}

export type { SqlDatabase };
