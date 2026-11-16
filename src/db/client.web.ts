import type { SqlDatabase } from '../types/models';
import { getWebStore } from './store.web';

/**
 * Web mock database adapter.
 * Repositories use store.web.ts in memory on web platforms.
 */
const notSql = (): never => {
  throw new Error('در نسخه‌ی وب، دیتابیس نمایشی فعال است و SQL اجرا نمی‌شود');
};

const webDatabase: SqlDatabase = {
  execSync: notSql,
  runSync: notSql,
  getAllSync: notSql,
  getFirstSync: notSql,
  withTransactionSync: (task) => task(),
};

export function getDatabase(): SqlDatabase {
  getWebStore(); // Initialize web store and default categories on first access.
  return webDatabase;
}
