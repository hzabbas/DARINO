import assert from 'node:assert/strict';
import test from 'node:test';

import { getSchemaVersion, migrate } from '../src/db/migrate';
import { SCHEMA_VERSION } from '../src/db/schema';
import { countPendingSms, listPendingSms } from '../src/db/pendingSms';
import type { SqlDatabase } from '../src/types/models';
import { createNodeDatabase } from './helpers/nodeDatabase';

function setup(): SqlDatabase {
  const db = createNodeDatabase();
  migrate(db);
  return db;
}

/** جدول pending_sms در نسخه‌ی ۳ (بدون ستون‌های merchant و suggested_category_id) */
const LEGACY_PENDING_SMS_SQL = `
CREATE TABLE pending_sms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sms_id TEXT NOT NULL UNIQUE,
  sender TEXT NOT NULL,
  bank_account_id INTEGER,
  raw_body TEXT NOT NULL,
  detected_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  fee_amount INTEGER NOT NULL DEFAULT 0,
  roundup_amount INTEGER NOT NULL DEFAULT 0,
  detected_balance INTEGER,
  date TEXT NOT NULL,
  shamsi_date TEXT NOT NULL,
  time TEXT,
  transfer_pair_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
`;

function indexNames(db: SqlDatabase, table: string): string[] {
  return db
    .getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name LIKE 'idx_%'",
      table,
    )
    .map((row) => row.name)
    .sort();
}

test('the schema version is bumped so the migration runs on older installs', () => {
  const db = setup();
  assert.equal(getSchemaVersion(db), SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, 5);
});

test('an existing pending_sms table gets the new columns without losing rows', () => {
  const db = createNodeDatabase();
  db.execSync(LEGACY_PENDING_SMS_SQL);
  db.runSync(
    `INSERT INTO pending_sms
      (sms_id, sender, bank_account_id, raw_body, detected_type, amount, fee_amount,
       roundup_amount, detected_balance, date, shamsi_date, time, transfer_pair_id, status, created_at)
     VALUES ('sms_old', 'B.Pasargad', NULL, 'متن قدیمی', 'expense', 1000, 0, 0, NULL,
             '2026-11-09T10:00:00', '۱۴۰۵/۰۸/۱۸', NULL, NULL, 'pending', '2026-11-09T10:00:00')`,
  );

  const result = migrate(db);

  assert.ok(result.addedColumns.includes('merchant'));
  assert.ok(result.addedColumns.includes('suggested_category_id'));

  const columns = db
    .getAllSync<{ name: string }>('PRAGMA table_info(pending_sms)')
    .map((row) => row.name);
  assert.ok(columns.includes('merchant'));
  assert.ok(columns.includes('suggested_category_id'));

  // ردیف قبلی سالم می‌ماند و ستون‌های تازه خالی‌اند
  const rows = listPendingSms(db, 'all');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].raw_body, 'متن قدیمی');
  assert.equal(rows[0].merchant, null);
  assert.equal(rows[0].suggested_category_id, null);
  assert.equal(countPendingSms(db), 1);
});

test('migrate is idempotent and stops reporting added columns', () => {
  const db = setup();

  const first = migrate(db);
  const second = migrate(db);

  assert.deepEqual(second.addedColumns, []);
  assert.equal(second.seeded, 0, 'دسته‌بندی‌های پیش‌فرض دوباره درج نمی‌شوند');
  assert.equal(second.version, first.version);
});

test('composite indexes cover the dashboard and report query paths', () => {
  const db = setup();

  assert.deepEqual(indexNames(db, 'transactions'), [
    'idx_transactions_bank_account',
    'idx_transactions_category_date',
    'idx_transactions_date_type',
    'idx_transactions_type',
  ]);
  assert.deepEqual(indexNames(db, 'pending_sms'), [
    'idx_pending_sms_account',
    'idx_pending_sms_date',
    'idx_pending_sms_status_date',
  ]);
});

test('the composite indexes have the columns the queries filter on', () => {
  const db = setup();

  const columns = (index: string) =>
    db
      .getAllSync<{ name: string }>(`PRAGMA index_info(${index})`)
      .map((row) => row.name)
      .sort();

  assert.deepEqual(columns('idx_transactions_date_type'), ['date', 'type']);
  assert.deepEqual(columns('idx_transactions_category_date'), ['category_id', 'date']);
  assert.deepEqual(columns('idx_pending_sms_status_date'), ['date', 'status']);
  assert.deepEqual(columns('idx_pending_sms_account'), ['bank_account_id']);
});

test('the redundant single column indexes are gone', () => {
  const db = setup();

  const names = db
    .getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'")
    .map((row) => row.name);

  for (const dropped of ['idx_transactions_date', 'idx_transactions_category', 'idx_pending_sms_status']) {
    assert.equal(names.includes(dropped), false, `${dropped} باید حذف شده باشد`);
  }
});

test('hot queries run off an index instead of scanning the table', () => {
  const db = setup();

  // برای اینکه برنامه‌ساز کوئری آمار داشته باشد، چند صد ردیف واقعی می‌ریزیم
  const insert = db.runSync.bind(db);
  for (let index = 0; index < 300; index += 1) {
    insert(
      `INSERT INTO transactions (amount, type, category_id, date, shamsi_date, note, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      1000 + index,
      index % 2 === 0 ? 'expense' : 'income',
      (index % 12) + 1,
      `2026-11-${String((index % 28) + 1).padStart(2, '0')}T10:00:00`,
      '۱۴۰۵/۰۸/۰۱',
      '2026-11-01T10:00:00',
    );
  }
  insert(
    `INSERT INTO pending_sms (sms_id, sender, bank_account_id, raw_body, detected_type, amount,
      date, shamsi_date, status, created_at)
     VALUES ('sms_1', 'B.SAMAN', NULL, 'متن', 'expense', 1000, '2026-11-09T10:00:00', '۱۴۰۵/۰۸/۱۸', 'pending', '2026-11-09T10:00:00')`,
  );
  db.execSync('ANALYZE');

  const plan = (sql: string, ...params: (string | number | null)[]) =>
    db
      .getAllSync<{ detail: string }>(sql, ...params)
      .map((row) => row.detail)
      .join(' | ');

  const rangeWithType = plan(
    'EXPLAIN QUERY PLAN SELECT id FROM transactions WHERE date >= ? AND date < ? AND type = ?',
    '2026-11-01T00:00:00',
    '2026-12-01T00:00:00',
    'expense',
  );
  assert.ok(
    rangeWithType.includes('USING INDEX') || rangeWithType.includes('USING COVERING INDEX'),
    `کوئری بازه+نوع باید از ایندکس استفاده کند: ${rangeWithType}`,
  );

  const rangeGrouped = plan(
    'EXPLAIN QUERY PLAN SELECT category_id, SUM(amount) FROM transactions WHERE date >= ? AND date < ? GROUP BY category_id',
    '2026-11-01T00:00:00',
    '2026-12-01T00:00:00',
  );
  assert.ok(
    rangeGrouped.includes('idx_transactions_date_type') ||
      rangeGrouped.includes('idx_transactions_category_date'),
    `گزارش تفکیک دسته باید از ایندکس ترکیبی استفاده کند: ${rangeGrouped}`,
  );

  const pendingQueue = plan(
    'EXPLAIN QUERY PLAN SELECT id FROM pending_sms WHERE status = ? ORDER BY date DESC',
    'pending',
  );
  assert.ok(
    pendingQueue.includes('idx_pending_sms_status_date'),
    `صف پیامک‌ها باید از ایندکس ترکیبی استفاده کند: ${pendingQueue}`,
  );
});
