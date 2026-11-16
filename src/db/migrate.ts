import type { SqlDatabase } from '../types/models';
import { seedDefaultCategories } from './seed';
import { BASE_TABLES_SQL, INDEXES_SQL, PRAGMAS_SQL, SCHEMA_VERSION } from './schema';

export function getSchemaVersion(db: SqlDatabase): number {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export interface ColumnSpec {
  /** Column name */
  name: string;
  /** Definition for ALTER TABLE ADD COLUMN */
  definition: string;
}

/** Added columns across versions requiring ALTER TABLE */
export const ADDED_COLUMNS: Record<string, ColumnSpec[]> = {
  pending_sms: [
    { name: 'merchant', definition: 'merchant TEXT' },
    { name: 'suggested_category_id', definition: 'suggested_category_id INTEGER' },
  ],
  bank_accounts: [
    { name: 'sync_from_ts', definition: 'sync_from_ts INTEGER NOT NULL DEFAULT 0' },
    { name: 'balance_anchor_ts', definition: 'balance_anchor_ts INTEGER NOT NULL DEFAULT 0' },
    { name: 'announce_voice', definition: 'announce_voice INTEGER NOT NULL DEFAULT 0' },
  ],
  transactions: [
    {
      name: 'bank_account_id',
      definition: 'bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL',
    },
  ],
};

export interface MigrateStepFailure {
  /** Failed migration step identifier */
  step: string;
  message: string;
}

export interface MigrateResult {
  seeded: number;
  version: number;
  /** Added columns during this run */
  addedColumns: string[];
  /** Count of backfilled records */
  backfilled: number;
  /** List of failed steps, if any */
  failures: MigrateStepFailure[];
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Executes single migration step without breaking subsequent steps. */
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

/** Adds missing columns and returns their names. */
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

/** Whether a column exists on a table. */
export function hasColumn(db: SqlDatabase, table: string, column: string): boolean {
  return db
    .getAllSync<{ name: string }>(`PRAGMA table_info(${table})`)
    .some((row) => row.name === column);
}

/**
 * Executes database migrations in deterministic order:
 *  1) pragmas
 *  2) base tables (IF NOT EXISTS)
 *  3) new columns via ALTER TABLE
 *  4) backfill missing timestamps
 *  5) performance indexes
 *  6) default categories seed
 *  7) user_version pragma update
 */
export function migrate(db: SqlDatabase): MigrateResult {
  const failures: MigrateStepFailure[] = [];

  step(failures, 'pragma', () => db.execSync(PRAGMAS_SQL));
  step(failures, 'base_tables', () => db.execSync(BASE_TABLES_SQL));

  const addedColumns: string[] = [];
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    // Each column executed separately
    for (const column of columns) {
      step(failures, `add_${table}_${column.name}`, () => {
        if (hasColumn(db, table, column.name)) return;
        db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column.definition}`);
        addedColumns.push(column.name);
      });
    }
  }

  const now = Date.now();
  let backfilled = 0;
  step(failures, 'backfill_sync_from_ts', () => {
    const result = db.runSync(
      'UPDATE bank_accounts SET sync_from_ts = ? WHERE sync_from_ts IS NULL OR sync_from_ts <= 0',
      now,
    );
    backfilled += result.changes;
  });
  step(failures, 'backfill_balance_anchor_ts', () => {
    const result = db.runSync(
      'UPDATE bank_accounts SET balance_anchor_ts = ? WHERE balance_anchor_ts IS NULL OR balance_anchor_ts <= 0',
      now,
    );
    backfilled += result.changes;
  });

  // Individual index statements
  for (const statement of INDEXES_SQL.split(';')) {
    const sql = statement.trim();
    if (!sql) continue;
    const label = sql.split(/\s+/).slice(0, 6).join(' ');
    step(failures, `index: ${label}`, () => db.execSync(sql));
  }

  let seeded = 0;
  step(failures, 'seed_categories', () => {
    seeded = seedDefaultCategories(db);
  });

  step(failures, 'set_user_version', () => {
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });

  return { seeded, version: SCHEMA_VERSION, addedColumns, backfilled, failures };
}
