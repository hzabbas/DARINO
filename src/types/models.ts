export type TransactionType = 'income' | 'expense';

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
}

export type NewCategory = Omit<Category, 'id'>;

export interface Transaction {
  id: number;
  amount: number;
  type: TransactionType;
  category_id: number | null;
  /** تاریخ میلادی به شکل ISO محلی (بدون منطقه‌ی زمانی) برای فیلتر دقیق */
  date: string;
  /** تاریخ شمسی آماده‌ی نمایش، مثل ۱۴۰۵/۰۸/۱۸ */
  shamsi_date: string;
  note: string | null;
  created_at: string;
}

export interface TransactionWithCategory extends Transaction {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

export type NewTransaction = {
  amount: number;
  type: TransactionType;
  category_id: number;
  date: string;
  shamsi_date: string;
  note?: string | null;
};

export interface MonthlySummary {
  income: number;
  expense: number;
  balance: number;
}

export interface CategoryTotal {
  category_id: number | null;
  name: string;
  icon: string;
  color: string;
  total: number;
  count: number;
}

/**
 * حداقل رابطی که لایه‌ی داده از دیتابیس انتظار دارد.
 * هم expo-sqlite و هم آداپتر تست (node:sqlite) این قرارداد را پیاده می‌کنند.
 */
export interface SqlDatabase {
  execSync(source: string): void;
  runSync(source: string, ...params: (string | number | null)[]): {
    lastInsertRowId: number;
    changes: number;
  };
  getAllSync<T>(source: string, ...params: (string | number | null)[]): T[];
  getFirstSync<T>(source: string, ...params: (string | number | null)[]): T | null;
  withTransactionSync(task: () => void): void;
}
