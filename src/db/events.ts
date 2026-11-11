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

export function subscribeDbChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyDbChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // یک شنونده‌ی خراب نباید بقیه را متوقف کند
    }
  });
}

/** برای تست‌ها: همه‌ی شنونده‌ها را پاک می‌کند. */
export function resetDbChangeListeners(): void {
  listeners.clear();
}

export type { SqlDatabase };
