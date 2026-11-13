import type { SqlDatabase } from '../types/models';

/**
 * اجرای اتمیک چند نوشتن روی دیتابیس.
 *
 * `expo-sqlite` تراکنش تو در تو را پشتیبانی نمی‌کند و `BEGIN` دوم خطا می‌دهد؛ ولی
 * بعضی توابع دامنه (مثلاً «تایید پیامک») خودشان داخل یک تراکنش، تابع دیگری را
 * صدا می‌زنند که آن هم تراکنش می‌خواهد. این نگهدارنده تشخیص می‌دهد که همین
 * دیتابیس از قبل داخل تراکنش است و در آن حالت فقط کار را اجرا می‌کند.
 */
const activeTransactions = new WeakSet<object>();

export function runInTransaction(db: SqlDatabase, task: () => void): void {
  const key = db as unknown as object;

  if (activeTransactions.has(key)) {
    task();
    return;
  }

  activeTransactions.add(key);
  try {
    db.withTransactionSync(task);
  } finally {
    activeTransactions.delete(key);
  }
}

/** فقط برای تست‌ها و تشخیص داخل‌بودن. */
export function isInsideTransaction(db: SqlDatabase): boolean {
  return activeTransactions.has(db as unknown as object);
}
