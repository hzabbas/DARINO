import type { SqlDatabase } from '../types/models';
import { seedDefaultCategories } from './seed';
import { BASE_TABLES_SQL, INDEXES_SQL, PRAGMAS_SQL, SCHEMA_VERSION } from './schema';

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
  bank_accounts: [
    { name: 'sync_from_ts', definition: 'sync_from_ts INTEGER NOT NULL DEFAULT 0' },
    { name: 'balance_anchor_ts', definition: 'balance_anchor_ts INTEGER NOT NULL DEFAULT 0' },
  ],
  transactions: [
    {
      name: 'bank_account_id',
      definition: 'bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL',
    },
  ],
};

export interface MigrateStepFailure {
  /** کدام مرحله شکست خورد (برای لاگ و برای نمایش قابل‌فهم) */
  step: string;
  message: string;
}

export interface MigrateResult {
  seeded: number;
  version: number;
  /** ستون‌هایی که در همین اجرا اضافه شدند */
  addedColumns: string[];
  /** چند ردیف مقدار خالی‌اش پر شد */
  backfilled: number;
  /** مرحله‌هایی که شکست خوردند؛ خالی یعنی همه‌چیز سالم بود */
  failures: MigrateStepFailure[];
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * اجرای یک مرحله‌ی مهاجرت بدون این‌که خطا کل اپ را زمین بزند.
 *
 * اصل طراحی: **هیچ مرحله‌ای نباید اجرای بقیه را متوقف کند.** مهاجرت دیتابیس روی
 * گوشی کاربر اتفاق می‌افتد؛ اگر مثلاً یک ایندکس ساخته نشود، بهتر است اپ بالا بیاید
 * و فقط همان ایندکس نباشد تا این‌که کل برنامه بسته شود.
 */
function step(failures: MigrateStepFailure[], label: string, task: () => void): boolean {
  try {
    task();
    return true;
  } catch (error) {
    failures.push({ step: label, message: describeError(error) });
    console.warn(`[migrate] ${label}: ${describeError(error)}`);
    return false;
  }
}

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

/** آیا این ستون روی این جدول وجود دارد؟ */
export function hasColumn(db: SqlDatabase, table: string, column: string): boolean {
  return db
    .getAllSync<{ name: string }>(`PRAGMA table_info(${table})`)
    .some((row) => row.name === column);
}

/**
 * ساخت/به‌روزرسانی ساختار دیتابیس.
 *
 * ترتیب اجرا عمداً همین است و هر بخش مستقل خطا می‌گیرد:
 *  ۱) pragmaها
 *  ۲) جدول‌های پایه (`IF NOT EXISTS`)
 *  ۳) ستون‌های تازه با `ALTER TABLE` — قبل از هر ایندکس و کوئری
 *  ۴) پر کردن مقادیر خالی (`sync_from_ts` / `balance_anchor_ts`)
 *  ۵) ایندکس‌ها — هر دستور جدا، تا یکی بقیه را زمین نزند
 *  ۶) درج دسته‌بندی‌های پیش‌فرض
 *  ۷) ثبت نسخه‌ی اسکیما
 *
 * نسخه‌ی ۳.۱.۰ این ترتیب را نداشت: ایندکسِ ستون تازه پیش از `ALTER` اجرا می‌شد و
 * روی دیتابیس هر کاربر ارتقاداده «no such column: bank_account_id» می‌داد. این‌جا
 * هم ترتیب درست است و هم خطاها گرفته می‌شوند تا اپ هرگز با کرش بالا نیاید.
 */
export function migrate(db: SqlDatabase): MigrateResult {
  const failures: MigrateStepFailure[] = [];

  step(failures, 'pragma', () => db.execSync(PRAGMAS_SQL));
  step(failures, 'ساخت جدول‌های پایه', () => db.execSync(BASE_TABLES_SQL));

  const addedColumns: string[] = [];
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    // هر ستون جدا: یک ALTER ناموفق نباید بقیه‌ی ستون‌ها را از دست بدهد
    for (const column of columns) {
      step(failures, `افزودن ${table}.${column.name}`, () => {
        if (hasColumn(db, table, column.name)) return;
        db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column.definition}`);
        addedColumns.push(column.name);
      });
    }
  }

  const now = Date.now();
  let backfilled = 0;
  step(failures, 'پر کردن sync_from_ts', () => {
    const result = db.runSync(
      'UPDATE bank_accounts SET sync_from_ts = ? WHERE sync_from_ts IS NULL OR sync_from_ts <= 0',
      now,
    );
    backfilled += result.changes;
  });
  step(failures, 'پر کردن balance_anchor_ts', () => {
    const result = db.runSync(
      'UPDATE bank_accounts SET balance_anchor_ts = ? WHERE balance_anchor_ts IS NULL OR balance_anchor_ts <= 0',
      now,
    );
    backfilled += result.changes;
  });

  // هر دستور ایندکس جدا اجرا می‌شود؛ یک ایندکس مشکل‌دار بقیه را از بین نمی‌برد
  for (const statement of INDEXES_SQL.split(';')) {
    const sql = statement.trim();
    if (!sql) continue;
    const label = sql.split(/\s+/).slice(0, 6).join(' ');
    step(failures, `ایندکس: ${label}`, () => db.execSync(sql));
  }

  let seeded = 0;
  step(failures, 'درج دسته‌بندی‌های پیش‌فرض', () => {
    seeded = seedDefaultCategories(db);
  });

  step(failures, 'ثبت نسخه‌ی اسکیما', () => {
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });

  return { seeded, version: SCHEMA_VERSION, addedColumns, backfilled, failures };
}
