import type { SqlDatabase } from '../types/models';
// مسیر صریح `.web`: در باندل وب Metro خودش `.web` را انتخاب می‌کند، ولی در تست‌های
// Node هیچ رزولوشن پلتفرمی وجود ندارد و import بدون پسوند به نسخه‌ی SQLite می‌افتد.
import { zeroAllBalances } from './bankAccounts.web';
import { notifyDbChange } from './events';
import { DEFAULT_CATEGORIES } from './seed';
import { getWebStore, persistWebStore } from './store.web';
import type { ResetSummary, TransactionsResetSummary } from './reset';

/**
 * نسخه‌ی وب «ریست اطلاعات».
 *
 * وب SQLite ندارد، پس همه‌ی کارها روی store.web انجام می‌شود؛ ولی رفتار باید
 * عیناً همان نسخه‌ی SQLite باشد (همان مقدار برگشتی، همان اعلان تغییر).
 */

/** «ریست تراکنش‌ها و موجودی‌ها»: حساب‌ها و دسته‌بندی‌ها می‌مانند، داده صفر می‌شود. */
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

/** «ریست کارخانه»: همه‌چیز پاک و دسته‌بندی‌های پیش‌فرض دوباره ساخته می‌شوند. */
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
