import type { SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import {
  BACKUP_APP_ID,
  BACKUP_VERSION,
  parseBackup,
  serializeBackup,
  type BackupPayload,
  type RestoreResult,
} from './backupFormat';
import { getWebStore, replaceWebStore } from './store.web';
import { notifyDbChange } from './events';

export {
  BACKUP_APP_ID,
  BACKUP_VERSION,
  buildBackupFileName,
  parseBackup,
} from './backupFormat';
export type { BackupPayload, RestoreResult } from './backupFormat';

/** پشتیبان‌گیری از دیتابیس نمایشی وب. */
export function createBackup(_database: SqlDatabase): BackupPayload {
  const state = getWebStore();
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exported_at: toLocalIso(new Date()),
    categories: state.categories.map((category) => ({ ...category })),
    transactions: state.transactions.map((transaction) => ({ ...transaction })),
    bank_accounts: state.bankAccounts.map((account) => ({ ...account })),
  };
}

export function backupToJson(database: SqlDatabase): string {
  return serializeBackup(createBackup(database));
}

/** بازیابی کامل در وب: داده‌ها در حافظه و localStorage جایگزین می‌شوند. */
export function restoreBackup(_database: SqlDatabase, json: string): RestoreResult {
  const backup = parseBackup(json);

  const maxCategoryId = backup.categories.reduce((max, item) => Math.max(max, item.id), 0);
  const maxTransactionId = backup.transactions.reduce((max, item) => Math.max(max, item.id), 0);
  const bankAccounts = backup.bank_accounts ?? getWebStore().bankAccounts;
  const maxBankAccountId = bankAccounts.reduce((max, item) => Math.max(max, item.id), 0);

  const previous = getWebStore();
  replaceWebStore({
    categories: backup.categories,
    transactions: backup.transactions.map((transaction) => ({
      ...transaction,
      bank_account_id: null,
    })),
    settings: previous.settings,
    bankAccounts,
    pendingSms: previous.pendingSms,
    nextCategoryId: maxCategoryId + 1,
    nextTransactionId: maxTransactionId + 1,
    nextBankAccountId: Math.max(previous.nextBankAccountId, maxBankAccountId + 1),
    nextPendingSmsId: previous.nextPendingSmsId,
  });

  notifyDbChange();

  return {
    categories: backup.categories.length,
    transactions: backup.transactions.length,
    accounts: backup.bank_accounts?.length ?? 0,
  };
}
