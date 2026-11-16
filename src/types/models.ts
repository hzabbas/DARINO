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
  /** ISO date string in local calendar day */
  date: string;
  /** Jalali date representation (e.g. 1405/08/18) */
  shamsi_date: string;
  note: string | null;
  created_at: string;
  /** Linked bank account ID; null for manual cash transactions */
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
  /** Linked account ID for bank transactions */
  bank_account_id?: number | null;
};

export interface MonthlySummary {
  income: number;
  expense: number;
  balance: number;
}

/** Half-open date interval [startIso, endIso) */
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

/** Synchronous database interface contract */
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

/** Bank account model */
export interface BankAccount {
  id: number;
  bank_code: string;
  title: string;
  account_number: string | null;
  senders: string[];
  initial_balance: number;
  current_balance: number;
  include_roundup: boolean;
  /** Whether deposit voice announcement is active for this card */
  announceVoice: boolean;
  is_active: boolean;
  created_at: string;
  /** Earliest timestamp (ms) to ingest SMS for this account */
  sync_from_ts: number;
  /** Timestamp when balance was verified */
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

/** Ingested bank SMS awaiting user confirmation */
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
  /** Merchant or counterparty name */
  merchant: string | null;
  /** Suggested category ID */
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
