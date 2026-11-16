import type { SqlDatabase } from '../types/models';

/**
 * Re-entrant transaction runner for SQLite database writes.
 * Supports nested invocations without failing on double BEGIN.
 */
const activeTransactions = new WeakSet<object>();

export function runInTransaction(db: SqlDatabase, task: () => void): void {
  const key = db as unknown as object;

  if (activeTransactions.has(key)) {
    task();
    return;
  }

  activeTransactions.add(key);
  try {
    db.withTransactionSync(task);
  } finally {
    activeTransactions.delete(key);
  }
}

/** Check if current db handle is within an active transaction */
export function isInsideTransaction(db: SqlDatabase): boolean {
  return activeTransactions.has(db as unknown as object);
}
