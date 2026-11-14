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
  /**
   * حسابی که این تراکنش به آن وصل است.
   *
   * `null` یعنی تراکنش دستی/نقدی که به هیچ حسابی وصل نیست و هیچ‌وقت موجودی
   * حسابی را تغییر نمی‌دهد. تراکنش‌های ساخته‌شده از پیامک بانکی (یا ادغام‌شده با
   * یکی) این ستون را پر دارند و در گزارش به‌عنوان «تراکنش بانکی» شناخته می‌شوند.
   */
  bank_account_id: number | null;
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
  /** برای تراکنش‌های بانکی یا ادغام‌شده با پیامک؛ دستی‌ها این را نمی‌فرستند */
  bank_account_id?: number | null;
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
  /**
   * اعلام صوتی واریز این کارت؛ برای راننده‌هایی که هنگام رانندگی نمی‌توانند
   * گوشی را نگاه کنند. فقط مخصوص اندروید است و در نسخه‌ی وب بی‌اثر می‌ماند.
   */
  announceVoice: boolean;
  is_active: boolean;
  created_at: string;
  /**
   * از این لحظه (میلی‌ثانیه) پیامک‌های بانکی این حساب خوانده می‌شوند.
   * بدون این مرز، اولین اتصال حساب کل صندوق پیامک قدیمی را به صف تایید می‌ریزد.
   */
  sync_from_ts: number;
  /**
   * آخرین لحظه‌ای که `current_balance` «قطعی» شده است: لحظه‌ی ساخت حساب، ویرایش
   * دستی موجودی، یا مانده‌ی اعلامی بانک در پیامک.
   *
   * تراکنش‌های هم‌روز یا بعد از این لحظه روی موجودی اعمال می‌شوند و تراکنش‌های
   * قدیمی‌تر (که کاربر قبل از وصل‌کردن حساب ثبت کرده و بانک هم آن‌ها را در مانده
   * لحاظ کرده) دوباره شمرده نمی‌شوند.
   */
  balance_anchor_ts: number;
}

export type NewBankAccount = {
  bank_code: string;
  title: string;
  account_number?: string | null;
  senders?: string[];
  initial_balance?: number;
  current_balance?: number;
  include_roundup?: boolean;
  announceVoice?: boolean;
  sync_from_ts?: number;
  balance_anchor_ts?: number;
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
