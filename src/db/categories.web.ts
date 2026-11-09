import type { Category, NewCategory, SqlDatabase, TransactionType } from '../types/models';
import { getWebStore, persistWebStore } from './store.web';

/** پیاده‌سازی نمایشی دسته‌بندی‌ها برای وب (بدون SQLite). */

export function listCategories(_database: SqlDatabase, type?: TransactionType): Category[] {
  const { categories } = getWebStore();
  return categories
    .filter((category) => (type ? category.type === type : true))
    .sort((first, second) => first.id - second.id);
}

export function getCategory(_database: SqlDatabase, id: number): Category | null {
  const { categories } = getWebStore();
  return categories.find((category) => category.id === id) ?? null;
}

export function countCategories(_database: SqlDatabase, type?: TransactionType): number {
  const { categories } = getWebStore();
  return type
    ? categories.filter((category) => category.type === type).length
    : categories.length;
}

export function createCategory(_database: SqlDatabase, category: NewCategory): number {
  const name = category.name.trim();
  if (!name) {
    throw new Error('نام دسته‌بندی نمی‌تواند خالی باشد');
  }

  const state = getWebStore();
  const id = state.nextCategoryId++;
  state.categories.push({ id, name, type: category.type, icon: category.icon, color: category.color });
  persistWebStore();
  return id;
}

export function updateCategory(
  _database: SqlDatabase,
  id: number,
  category: NewCategory,
): void {
  const name = category.name.trim();
  if (!name) {
    throw new Error('نام دسته‌بندی نمی‌تواند خالی باشد');
  }

  const state = getWebStore();
  const index = state.categories.findIndex((item) => item.id === id);
  if (index === -1) {
    return;
  }

  state.categories[index] = {
    id,
    name,
    type: category.type,
    icon: category.icon,
    color: category.color,
  };
  persistWebStore();
}

/** مثل نسخه‌ی بومی: تراکنش‌ها حذف نمی‌شوند و فقط دسته‌بندی‌شان خالی می‌شود. */
export function deleteCategory(_database: SqlDatabase, id: number): void {
  const state = getWebStore();
  state.categories = state.categories.filter((category) => category.id !== id);
  state.transactions = state.transactions.map((transaction) =>
    transaction.category_id === id ? { ...transaction, category_id: null } : transaction,
  );
  persistWebStore();
}

export function countTransactionsForCategory(_database: SqlDatabase, id: number): number {
  const { transactions } = getWebStore();
  return transactions.filter((transaction) => transaction.category_id === id).length;
}

export function moveTransactions(
  _database: SqlDatabase,
  fromCategoryId: number,
  toCategoryId: number,
): number {
  if (fromCategoryId === toCategoryId) {
    throw new Error('دسته‌بندی مبدأ و مقصد یکسان است');
  }

  const state = getWebStore();
  const source = state.categories.find((category) => category.id === fromCategoryId);
  const destination = state.categories.find((category) => category.id === toCategoryId);
  if (!source || !destination) {
    throw new Error('دسته‌بندی پیدا نشد');
  }
  if (source.type !== destination.type) {
    throw new Error('انتقال تراکنش‌ها فقط بین دسته‌بندی‌های هم‌نوع ممکن است');
  }

  let moved = 0;
  state.transactions = state.transactions.map((transaction) => {
    if (transaction.category_id !== fromCategoryId) {
      return transaction;
    }
    moved += 1;
    return { ...transaction, category_id: toCategoryId };
  });
  persistWebStore();
  return moved;
}

export function deleteEmptyCategory(_database: SqlDatabase, id: number): void {
  if (countTransactionsForCategory(_database, id) > 0) {
    throw new Error('این دسته‌بندی تراکنش دارد؛ ابتدا تکلیف تراکنش‌ها را مشخص کن');
  }
  deleteCategory(_database, id);
}

export function deleteCategoryWithTransactions(_database: SqlDatabase, id: number): number {
  const state = getWebStore();
  const before = state.transactions.length;
  state.categories = state.categories.filter((category) => category.id !== id);
  state.transactions = state.transactions.filter((transaction) => transaction.category_id !== id);
  persistWebStore();
  return before - state.transactions.length;
}

export function getCategoryUsageCounts(_database: SqlDatabase): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const transaction of getWebStore().transactions) {
    if (transaction.category_id != null) {
      counts[transaction.category_id] = (counts[transaction.category_id] ?? 0) + 1;
    }
  }
  return counts;
}
