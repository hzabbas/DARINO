import type { SqlDatabase } from '../types/models';
import { getWebStore } from './store.web';

/**
 * نسخه‌ی وب دیتابیس.
 *
 * روی وب عمداً از SQLite استفاده نمی‌کنیم (نه wa-sqlite و نه SharedArrayBuffer)؛
 * همه‌ی repositoryها در وب به store.web وصل می‌شوند و این آبجکت فقط برای
 * هم‌خوانی امضای توابع در اختیارشان قرار می‌گیرد.
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
  getWebStore(); // اولین اجرا: ساخت دسته‌بندی‌های پیش‌فرض
  return webDatabase;
}
