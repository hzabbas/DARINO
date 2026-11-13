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

/** بازه‌ی نیم‌باز [startIso, endIso) برای فیلتر تراکنش‌ها. null یعنی بدون فیلتر. */
export interface DateRange {
  startIso: string;
  endIso: string;
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

/** حساب بانکی کاربر؛ `senders` در دیتابیس به شکل JSON ذخیره می‌شود. */
export interface BankAccount {
  id: number;
  bank_code: string;
  title: string;
  account_number: string | null;
  senders: string[];
  initial_balance: number;
  current_balance: number;
  include_roundup: boolean;
  is_active: boolean;
  created_at: string;
}

export type NewBankAccount = {
  bank_code: string;
  title: string;
  account_number?: string | null;
  senders?: string[];
  initial_balance?: number;
  current_balance?: number;
  include_roundup?: boolean;
};

export type PendingSmsType = 'income' | 'expense' | 'transfer';
export type PendingSmsStatus = 'pending' | 'approved' | 'ignored';

/** پیامک بانکی کشف‌شده که منتظر تایید کاربر است. */
export interface PendingSms {
  id: number;
  sms_id: string;
  sender: string;
  bank_account_id: number | null;
  raw_body: string;
  detected_type: PendingSmsType;
  amount: number;
  fee_amount: number;
  roundup_amount: number;
  detected_balance: number | null;
  date: string;
  shamsi_date: string;
  time: string | null;
  transfer_pair_id: string | null;
  status: PendingSmsStatus;
  created_at: string;
  /** نام فروشنده/طرف حساب استخراج‌شده از پیامک */
  merchant: string | null;
  /** دسته‌بندی پیشنهادی سیستم (بر اساس تاریخچه یا کلیدواژه) */
  suggested_category_id: number | null;
}

export type NewPendingSms = {
  sms_id: string;
  sender: string;
  bank_account_id: number | null;
  raw_body: string;
  detected_type: PendingSmsType;
  amount: number;
  fee_amount?: number;
  roundup_amount?: number;
  detected_balance?: number | null;
  date: string;
  shamsi_date: string;
  time?: string | null;
  merchant?: string | null;
  suggested_category_id?: number | null;
};
