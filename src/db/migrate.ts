import type { SqlDatabase } from '../types/models';
import { seedDefaultCategories } from './seed';
import { PRAGMAS_SQL, SCHEMA_SQL, SCHEMA_VERSION } from './schema';

export function getSchemaVersion(db: SqlDatabase): number {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export interface ColumnSpec {
  /** نام ستون در جدول */
  name: string;
  /** تعریف کامل برای ALTER TABLE، مثل `merchant TEXT` */
  definition: string;
}

/**
 * ستون‌هایی که در نسخه‌های قبلی دیتابیس نبوده‌اند.
 *
 * `CREATE TABLE IF NOT EXISTS` روی جدول موجود هیچ کاری نمی‌کند؛ پس ستون تازه باید
 * با `ALTER TABLE` اضافه شود، وگرنه نصب‌های قبلی هنگام خواندن آن ستون خطا می‌دهند.
 */
export const ADDED_COLUMNS: Record<string, ColumnSpec[]> = {
  pending_sms: [
    { name: 'merchant', definition: 'merchant TEXT' },
    { name: 'suggested_category_id', definition: 'suggested_category_id INTEGER' },
  ],
};

/** ستون‌هایی که وجود ندارند را اضافه می‌کند و نامشان را برمی‌گرداند. */
export function ensureColumns(db: SqlDatabase, table: string, columns: ColumnSpec[]): string[] {
  const existing = new Set(
    db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((column) => column.name),
  );

  const added: string[] = [];
  for (const column of columns) {
    if (existing.has(column.name)) continue;
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column.definition}`);
    added.push(column.name);
  }

  return added;
}

export interface MigrateResult {
  seeded: number;
  version: number;
  /** ستون‌هایی که در همین اجرا اضافه شدند */
  addedColumns: string[];
}

/**
 * ساخت جدول‌ها (idempotent)، افزودن ستون‌های تازه، ساخت ایندکس‌ها و درج داده‌های
 * اولیه. چون SCHEMA_SQL از `IF NOT EXISTS` استفاده می‌کند، اجرای دوباره بی‌خطر است
 * و ایندکس‌های تازه روی دیتابیس موجود هم ساخته می‌شوند.
 */
export function migrate(db: SqlDatabase): MigrateResult {
  db.execSync(PRAGMAS_SQL);
  db.execSync(SCHEMA_SQL);

  const addedColumns = Object.entries(ADDED_COLUMNS).flatMap(([table, columns]) =>
    ensureColumns(db, table, columns),
  );

  const seeded = seedDefaultCategories(db);
  db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  return { seeded, version: SCHEMA_VERSION, addedColumns };
}
