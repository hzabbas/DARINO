export const SCHEMA_VERSION = 6;

export const DATABASE_NAME = 'darino.db';

/** اجرای این pragmaها در هر بار باز شدن دیتابیس لازم است. */
export const PRAGMAS_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`;

/**
 * ساختار پایه‌ی دیتابیس آفلاین.
 *
 * مبلغ همیشه عدد صحیح (تومان) است تا خطای گرد کردن اعشاری نداشته باشیم.
 *
 * ⚠️ این متن فقط «جدول‌ها» را می‌سازد و عمداً **هیچ ایندکسی** ندارد.
 * دلیلش یک باگ واقعی در نسخه‌ی ۳.۱.۰ است: ایندکس `idx_transactions_bank_account`
 * روی ستونی ساخته می‌شد که در دیتابیس‌های قبلی وجود نداشت، و چون `SCHEMA_SQL` پیش
 * از `ALTER TABLE` اجرا می‌شد، کل `migrate()` با «no such column» می‌شکست و اپ روی
 * هر نصب ارتقایی بالا نمی‌آمد. ترتیب درست در `migrate.ts` است:
 *   جدول‌ها → افزودن ستون‌های تازه → پر کردن مقادیر خالی → ایندکس‌ها
 * پس ایندکس‌ها جای جداگانه‌ای دارند (`INDEXES_SQL`).
 */
export const BASE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  shamsi_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  -- فقط در نصب تازه ساخته می‌شود؛ برای نصب‌های قبلی با ALTER اضافه می‌شود
  bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_code TEXT NOT NULL,
  title TEXT NOT NULL,
  account_number TEXT,
  senders TEXT NOT NULL DEFAULT '[]',
  initial_balance INTEGER NOT NULL DEFAULT 0,
  current_balance INTEGER NOT NULL DEFAULT 0,
  include_roundup INTEGER NOT NULL DEFAULT 0,
  -- اعلام صوتی واریز برای همین کارت (حالت رانندگی)
  announce_voice INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  -- از چه لحظه‌ای پیامک‌های بانکی این حساب خوانده شوند (میلی‌ثانیه)
  sync_from_ts INTEGER NOT NULL DEFAULT 0,
  -- آخرین لحظه‌ای که موجودی این حساب «قطعی» شده (ساخت/ویرایش دستی/مانده‌ی پیامک)
  balance_anchor_ts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pending_sms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sms_id TEXT NOT NULL UNIQUE,
  sender TEXT NOT NULL,
  bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
  raw_body TEXT NOT NULL,
  detected_type TEXT NOT NULL CHECK (detected_type IN ('income', 'expense', 'transfer')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  fee_amount INTEGER NOT NULL DEFAULT 0,
  roundup_amount INTEGER NOT NULL DEFAULT 0,
  detected_balance INTEGER,
  date TEXT NOT NULL,
  shamsi_date TEXT NOT NULL,
  time TEXT,
  transfer_pair_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'ignored')),
  created_at TEXT NOT NULL,
  merchant TEXT,
  suggested_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
);
`;

/**
 * ایندکس‌ها؛ فقط بعد از این‌که همه‌ی ستون‌های لازم وجود دارند اجرا می‌شوند.
 *
 * کوئری‌های داشبورد و گزارش‌ها تقریباً همیشه یک بازه‌ی تاریخی را با نوع یا دسته
 * ترکیب می‌کنند («هزینه‌های این ماه»)، پس ایندکس تک‌ستونی «تاریخ» و «دسته» با
 * پیشوند همین ایندکس‌های ترکیبی پوشش داده می‌شوند و حذف شده‌اند تا هزینه‌ی نوشتن
 * و حجم دیتابیس کمتر شود.
 *
 * هر دستور جدا اجرا می‌شود (در `migrate.ts` با try/catch) تا یک ایندکس مشکل‌دار
 * بقیه را زمین نزند.
 */
export const INDEXES_SQL = `
DROP INDEX IF EXISTS idx_transactions_date;
DROP INDEX IF EXISTS idx_transactions_category;
DROP INDEX IF EXISTS idx_pending_sms_status;

CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions(date, type);
CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_bank_account ON transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_pending_sms_status_date ON pending_sms(status, date);
CREATE INDEX IF NOT EXISTS idx_pending_sms_date ON pending_sms(date);
-- حذف حساب بانکی باید ردیف‌های وابسته را سریع پیدا کند (ON DELETE SET NULL)
CREATE INDEX IF NOT EXISTS idx_pending_sms_account ON pending_sms(bank_account_id);
`;

/**
 * @deprecated از این استفاده نکن: اجرای این متن روی دیتابیس نسخه‌های قبلی ممکن است
 * شکست بخورد (ستون‌های تازه هنوز وجود ندارند). از `migrate()` استفاده کن.
 */
export const SCHEMA_SQL = `${BASE_TABLES_SQL}\n${INDEXES_SQL}`;
