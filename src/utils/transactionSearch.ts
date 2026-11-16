import type { TransactionWithCategory } from '../types/models';
import { toLatinDigits } from './digits';

/**
 * Normalize search query: Persian digits to Latin, remove thousands separators.
 */
export function normalizeSearchQuery(query: string): string {
  return toLatinDigits(query)
    .replace(/[,٬]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Check if transaction matches query across category, note, or amount. */
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
