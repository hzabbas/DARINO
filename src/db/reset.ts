import type { SqlDatabase } from '../types/models';
import { zeroAllBalances } from './bankAccounts';
import { notifyDbChange } from './events';
import { seedDefaultCategories } from './seed';
import { runInTransaction } from './transaction';

export interface ResetSummary {
  transactions: number;
  pendingSms: number;
  accounts: number;
  categories: number;
  settings: number;
  seeded: number;
}

function countRows(db: SqlDatabase, table: string): number {
  const row = db.getFirstSync<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
  return row?.total ?? 0;
}

export interface TransactionsResetSummary {
  transactions: number;
  pendingSms: number;
  accountsZeroed: number;
}

/**
 * Reset transactions and zero account balances while preserving bank accounts,
 * categories, and settings.
 */
export function resetTransactionsAndBalances(db: SqlDatabase): TransactionsResetSummary {
  const transactions = countRows(db, 'transactions');
  const pendingSms = countRows(db, 'pending_sms');
  let accountsZeroed = 0;

  runInTransaction(db, () => {
    db.runSync('DELETE FROM transactions');
    db.runSync('DELETE FROM pending_sms');
    accountsZeroed = zeroAllBalances(db);
    resetAutoIncrement(db, ['transactions', 'pending_sms']);
  });

  notifyDbChange();
  return { transactions, pendingSms, accountsZeroed };
}

/**
 * Factory reset: cleans all tables and re-seeds default categories.
 */
export function factoryReset(db: SqlDatabase): ResetSummary {
  const summary: ResetSummary = {
    transactions: countRows(db, 'transactions'),
    pendingSms: countRows(db, 'pending_sms'),
    accounts: countRows(db, 'bank_accounts'),
    categories: countRows(db, 'categories'),
    settings: countRows(db, 'settings'),
    seeded: 0,
  };

  runInTransaction(db, () => {
    db.runSync('DELETE FROM transactions');
    db.runSync('DELETE FROM pending_sms');
    db.runSync('DELETE FROM bank_accounts');
    db.runSync('DELETE FROM categories');
    db.runSync('DELETE FROM settings');
    resetAutoIncrement(db, [
      'transactions',
      'pending_sms',
      'bank_accounts',
      'categories',
    ]);
    summary.seeded = seedDefaultCategories(db);
  });

  notifyDbChange();
  return summary;
}

/**
 * Reset sqlite_sequence counters for given tables.
 */
function resetAutoIncrement(db: SqlDatabase, tables: string[]): void {
  try {
    db.runSync(
      `DELETE FROM sqlite_sequence WHERE name IN (${tables.map(() => '?').join(', ')})`,
      ...tables,
    );
  } catch {
    // sqlite_sequence may not exist if tables have no autoincrement.
  }
}
