import type { TransactionWithCategory } from '../types/models';
import { toLatinDigits } from './digits';

/**
 * آماده‌سازی عبارت جستجو: ارقام فارسی به لاتین، حذف جداکننده‌ی هزارگان و فاصله‌های اضافه.
 * «۲۵۰,۰۰۰» → «250000»
 */
export function normalizeSearchQuery(query: string): string {
  return toLatinDigits(query)
    .replace(/[,٬]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** جستجو در نام دسته، یادداشت و مبلغ تراکنش. */
export function matchesTransactionQuery(
  transaction: TransactionWithCategory,
  query: string,
): boolean {
  const needle = normalizeSearchQuery(query);
  if (!needle) {
    return true;
  }

  if (transaction.category_name) {
    if (normalizeSearchQuery(transaction.category_name).includes(needle)) {
      return true;
    }
  }

  if (transaction.note) {
    if (normalizeSearchQuery(transaction.note).includes(needle)) {
      return true;
    }
  }

  return String(transaction.amount).includes(needle);
}
