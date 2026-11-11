import type { Category, SqlDatabase, Transaction } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { notifyDbChange } from './events';
import {
  BACKUP_APP_ID,
  BACKUP_VERSION,
  parseBackup,
  serializeBackup,
  type BackupPayload,
  type RestoreResult,
} from './backupFormat';

export {
  BACKUP_APP_ID,
  BACKUP_VERSION,
  buildBackupFileName,
  parseBackup,
} from './backupFormat';
export type { BackupPayload, RestoreResult } from './backupFormat';

const CATEGORY_SELECT = 'SELECT id, name, type, icon, color FROM categories ORDER BY id ASC';
const TRANSACTION_SELECT = `
  SELECT id, amount, type, category_id, date, shamsi_date, note, created_at
  FROM transactions
  ORDER BY id ASC
`;

/** خواندن کل دیتابیس به شکل یک آبجکت قابل تبدیل به JSON. */
export function createBackup(db: SqlDatabase): BackupPayload {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exported_at: toLocalIso(new Date()),
    categories: db.getAllSync<Category>(CATEGORY_SELECT),
    transactions: db.getAllSync<Transaction>(TRANSACTION_SELECT),
  };
}

export function backupToJson(db: SqlDatabase): string {
  return serializeBackup(createBackup(db));
}

/**
 * جایگزینی کامل داده‌های فعلی با محتوای فایل پشتیبان.
 * همه‌ی عملیات داخل یک تراکنش انجام می‌شود؛ اگر خطایی رخ دهد هیچ داده‌ای تغییر نمی‌کند.
 */
export function restoreBackup(db: SqlDatabase, json: string): RestoreResult {
  const backup = parseBackup(json);

  db.withTransactionSync(() => {
    db.runSync('DELETE FROM transactions');
    db.runSync('DELETE FROM categories');

    for (const category of backup.categories) {
      db.runSync(
        'INSERT INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)',
        category.id,
        category.name,
        category.type,
        category.icon,
        category.color,
      );
    }

    for (const transaction of backup.transactions) {
      db.runSync(
        `INSERT INTO transactions (id, amount, type, category_id, date, shamsi_date, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        transaction.id,
        transaction.amount,
        transaction.type,
        transaction.category_id,
        transaction.date,
        transaction.shamsi_date,
        transaction.note,
        transaction.created_at,
      );
    }
  });

  notifyDbChange();

  return {
    categories: backup.categories.length,
    transactions: backup.transactions.length,
  };
}
