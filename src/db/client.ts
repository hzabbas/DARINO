import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { SqlDatabase } from '../types/models';
import { migrate, type MigrateResult } from './migrate';
import { sanitizeSqlParams } from './sqlParams';
import { DATABASE_NAME } from './schema';

let connection: SqlDatabase | null = null;
let report: MigrateResult | null = null;
let openError: string | null = null;

/**
 * Wrap SQLite database instance with parameter sanitizer to prevent
 * undefined/NaN from reaching native layer.
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
 * Database singleton connection. Migrations run on first connection.
 * On web, client.web.ts is used instead.
 */
export function getDatabase(): SqlDatabase {
  if (!connection) {
    const database = openDatabaseSync(DATABASE_NAME);
    try {
      report = migrate(database);
      openError = null;
    } catch (error) {
      // Safety net if migrate throws unexpectedly.
      openError = error instanceof Error ? error.message : String(error);
      report = null;
    }
    connection = wrap(database);
  }
  return connection;
}

/** Migration report for diagnostics. */
export function getMigrationReport(): MigrateResult | null {
  return report;
}

/** Database open error message or null. */
export function getDatabaseOpenError(): string | null {
  return openError;
}

/** Reset cached connection (tests / retry). */
export function resetDatabaseConnection(): void {
  connection = null;
  report = null;
  openError = null;
}
