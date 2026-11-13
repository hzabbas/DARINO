export const SCHEMA_VERSION = 3;

export const DATABASE_NAME = 'darino.db';

/** اجرای این pragmaها در هر بار باز شدن دیتابیس لازم است. */
export const PRAGMAS_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`;

/**
 * ساختار پایه‌ی دیتابیس آفلاین.
 * مبلغ همیشه عدد صحیح (تومان) است تا خطای گرد کردن اعشاری نداشته باشیم.
 */
export const SCHEMA_SQL = `
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
  created_at TEXT NOT NULL
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
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
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
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_sms_status ON pending_sms(status);
CREATE INDEX IF NOT EXISTS idx_pending_sms_date ON pending_sms(date);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
`;
