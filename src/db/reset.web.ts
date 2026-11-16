import type { SqlDatabase } from '../types/models';
// Explicit .web import for test runner compatibility.
import { zeroAllBalances } from './bankAccounts.web';
import { notifyDbChange } from './events';
import { DEFAULT_CATEGORIES } from './seed';
import { getWebStore, persistWebStore } from './store.web';
import type { ResetSummary, TransactionsResetSummary } from './reset';

/**
 * Web mock implementation for data reset operations.
 */

/** Reset transactions and zero balances, preserving accounts and categories. */
export function resetTransactionsAndBalances(_db: SqlDatabase): TransactionsResetSummary {
  const store = getWebStore();
  const summary: TransactionsResetSummary = {
    transactions: store.transactions.length,
    pendingSms: store.pendingSms.length,
    accountsZeroed: 0,
  };

  store.transactions = [];
  store.pendingSms = [];
  summary.accountsZeroed = zeroAllBalances(_db);

  persistWebStore();
  notifyDbChange();
  return summary;
}

/** Factory reset: clears all data and re-seeds default categories. */
export function factoryReset(_db: SqlDatabase): ResetSummary {
  const store = getWebStore();
  const summary: ResetSummary = {
    transactions: store.transactions.length,
    pendingSms: store.pendingSms.length,
    accounts: store.bankAccounts.length,
    categories: store.categories.length,
    settings: Object.keys(store.settings).length,
    seeded: DEFAULT_CATEGORIES.length,
  };

  store.transactions = [];
  store.pendingSms = [];
  store.bankAccounts = [];
  store.settings = {};
  store.categories = DEFAULT_CATEGORIES.map((category, index) => ({ id: index + 1, ...category }));
  store.nextCategoryId = store.categories.length + 1;
  store.nextTransactionId = 1;
  store.nextBankAccountId = 1;
  store.nextPendingSmsId = 1;

  persistWebStore();
  notifyDbChange();
  return summary;
}
