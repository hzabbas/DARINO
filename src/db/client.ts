import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { SqlDatabase } from '../types/models';
import { migrate } from './migrate';
import { DATABASE_NAME } from './schema';

let connection: SQLiteDatabase | null = null;

/**
 * دیتابیس فقط یک بار باز می‌شود و در طول عمر اپ همان اتصال استفاده می‌شود.
 * ساخت جدول‌ها و درج دسته‌بندی‌های پیش‌فرض هم همین‌جا انجام می‌شود تا
 * صفحه‌ها همیشه با دیتابیس آماده بالا بیایند.
 *
 * در نسخه‌ی وب، Metro به‌جای این فایل `client.web.ts` را بارگذاری می‌کند
 * (دیتابیس نمایشی و بدون SQLite).
 */
export function getDatabase(): SqlDatabase {
  if (!connection) {
    const database = openDatabaseSync(DATABASE_NAME);
    migrate(database);
    connection = database;
  }
  return connection;
}
