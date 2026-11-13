import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { SqlDatabase } from '../types/models';
import { migrate, type MigrateResult } from './migrate';
import { sanitizeSqlParams } from './sqlParams';
import { DATABASE_NAME } from './schema';

let connection: SqlDatabase | null = null;
let report: MigrateResult | null = null;
let openError: string | null = null;

/**
 * همه‌ی پارامترها از این‌جا عبور می‌کنند تا هیچ‌وقت `undefined`/`NaN` به لایه‌ی
 * نیتیو expo-sqlite نرسد (آن‌جا خطای HostFunction می‌دهد که در JS قابل گرفتن نیست).
 */
function wrap(database: SQLiteDatabase): SqlDatabase {
  return {
    execSync(source: string): void {
      database.execSync(source);
    },
    runSync(source: string, ...params: (string | number | null)[]) {
      return database.runSync(source, ...sanitizeSqlParams(params));
    },
    getAllSync<T>(source: string, ...params: (string | number | null)[]): T[] {
      return database.getAllSync(source, ...sanitizeSqlParams(params)) as unknown as T[];
    },
    getFirstSync<T>(source: string, ...params: (string | number | null)[]): T | null {
      return database.getFirstSync(source, ...sanitizeSqlParams(params)) as T | null;
    },
    withTransactionSync(task: () => void): void {
      database.withTransactionSync(task);
    },
  };
}

/**
 * دیتابیس فقط یک بار باز می‌شود و در طول عمر اپ همان اتصال استفاده می‌شود.
 * ساخت جدول‌ها و درج دسته‌بندی‌های پیش‌فرض هم همین‌جا انجام می‌شود تا صفحه‌ها
 * همیشه با دیتابیس آماده بالا بیایند.
 *
 * دو نکته‌ی مهم:
 *  - `migrate` خودش هیچ‌وقت throw نمی‌کند؛ خطاهای مرحله‌ای را در گزارش برمی‌گرداند.
 *  - اگر باز کردن دیتابیس شکست بخورد، استثنا به `DatabaseProvider` می‌رسد تا به‌جای
 *    کرش، صفحه‌ی بازیابی نشان داده شود.
 *
 * در نسخه‌ی وب، Metro به‌جای این فایل `client.web.ts` را بارگذاری می‌کند.
 */
export function getDatabase(): SqlDatabase {
  if (!connection) {
    const database = openDatabaseSync(DATABASE_NAME);
    try {
      report = migrate(database);
      openError = null;
    } catch (error) {
      // migrate طراحی شده که throw نکند؛ این فقط تور اطمینان است.
      openError = error instanceof Error ? error.message : String(error);
      report = null;
    }
    connection = wrap(database);
  }
  return connection;
}

/** گزارش آخرین مهاجرت (برای صفحه‌ی تشخیص و تست‌ها). */
export function getMigrationReport(): MigrateResult | null {
  return report;
}

/** اگر باز کردن دیتابیس استثنا داده باشد، متن خطا؛ وگرنه null. */
export function getDatabaseOpenError(): string | null {
  return openError;
}

/** فقط برای تست‌ها/تلاش مجدد: اتصال کش‌شده را دور می‌ریزد. */
export function resetDatabaseConnection(): void {
  connection = null;
  report = null;
  openError = null;
}
