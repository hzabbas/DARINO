import { DatabaseSync } from 'node:sqlite';

import type { SqlDatabase } from '../../src/types/models';

type SqlValue = string | number | null;

/**
 * آداپتر تست: همان قرارداد SqlDatabase را روی node:sqlite پیاده می‌کند
 * تا منطق واقعی دیتابیس بدون شبیه‌سازی (mock) تست شود.
 */
export function createNodeDatabase(): SqlDatabase {
  const database = new DatabaseSync(':memory:');

  return {
    execSync(source: string): void {
      database.exec(source);
    },
    runSync(source: string, ...params: SqlValue[]) {
      const result = database.prepare(source).run(...params);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    getAllSync<T>(source: string, ...params: SqlValue[]): T[] {
      return database.prepare(source).all(...params) as unknown as T[];
    },
    getFirstSync<T>(source: string, ...params: SqlValue[]): T | null {
      const row = database.prepare(source).get(...params);
      return (row as unknown as T) ?? null;
    },
    withTransactionSync(task: () => void): void {
      database.exec('BEGIN');
      try {
        task();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
