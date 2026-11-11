import type { SqlDatabase } from '../types/models';
import { notifyDbChange } from './events';

/**
 * تنظیمات کلید/مقدار.
 * هم تم برنامه و هم هدف درآمد و سقف بودجه اینجا نگه‌داری می‌شوند.
 */
export function getSetting(db: SqlDatabase, key: string): string | null {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export function setSetting(db: SqlDatabase, key: string, value: string): void {
  db.runSync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
  notifyDbChange();
}

export function deleteSetting(db: SqlDatabase, key: string): void {
  db.runSync('DELETE FROM settings WHERE key = ?', key);
  notifyDbChange();
}

export function getAllSettings(db: SqlDatabase): Record<string, string> {
  const rows = db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/** عددی خواندن تنظیمات؛ مقدار خالی یا خراب صفر حساب می‌شود. */
export function getNumericSetting(db: SqlDatabase, key: string): number {
  const raw = getSetting(db, key);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}
