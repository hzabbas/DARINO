import type { BankAccount, Category, Transaction } from '../types/models';
import { getJalaliParts, toLocalIso } from '../utils/jalali';

export const BACKUP_APP_ID = 'darino';
export const BACKUP_VERSION = 1;

export interface BackupPayload {
  app: string;
  version: number;
  exported_at: string;
  categories: Category[];
  transactions: Transaction[];
  /**
   * حساب‌های بانکی هم به‌صورت اختیاری پشتیبان‌گیری می‌شوند.
   *
   * در فایل‌های قدیمی این کلید وجود ندارد؛ در آن حالت هنگام بازیابی حساب‌های فعلی
   * دست‌نخورده می‌مانند تا رفتار نسخه‌های قبل عوض نشود.
   */
  bank_accounts?: BankAccount[];
}

export interface RestoreResult {
  categories: number;
  transactions: number;
  /** تعداد حساب‌های بانکی بازگردانی‌شده (صفر برای فایل‌های قدیمی) */
  accounts: number;
}

function fail(message: string): never {
  throw new Error(message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** نام فایل پشتیبان با تاریخ شمسی؛ ارقام لاتین برای سازگاری با فایل‌منیجرها. */
export function buildBackupFileName(now: Date = new Date()): string {
  const { jy, jm, jd } = getJalaliParts(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `darino-backup-${jy}-${pad(jm)}-${pad(jd)}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}.json`;
}

function parseCategory(value: unknown, index: number, seenIds: Set<number>): Category {
  const label = `دسته‌بندی شماره ${index + 1}`;
  const row = asRecord(value) ?? fail(`${label}: ساختار نامعتبر است`);

  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) {
    fail(`${label}: شناسه نامعتبر است`);
  }
  if (seenIds.has(id)) {
    fail(`${label}: شناسه تکراری است`);
  }
  seenIds.add(id);

  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) {
    fail(`${label}: نام خالی است`);
  }

  const type = row.type;
  if (type !== 'income' && type !== 'expense') {
    fail(`${label}: نوع باید درآمد یا هزینه باشد`);
  }

  const icon = typeof row.icon === 'string' && row.icon ? row.icon : 'help-circle-outline';
  const color =
    typeof row.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(row.color)
      ? row.color
      : '#94A3B8';

  return { id, name, type, icon, color };
}

function parseTransaction(
  value: unknown,
  index: number,
  categoryIds: Set<number>,
  seenIds: Set<number>,
): Transaction {
  const label = `تراکنش شماره ${index + 1}`;
  const row = asRecord(value) ?? fail(`${label}: ساختار نامعتبر است`);

  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) {
    fail(`${label}: شناسه نامعتبر است`);
  }
  if (seenIds.has(id)) {
    fail(`${label}: شناسه تکراری است`);
  }
  seenIds.add(id);

  const amount = Number(row.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    fail(`${label}: مبلغ نامعتبر است`);
  }

  const type = row.type;
  if (type !== 'income' && type !== 'expense') {
    fail(`${label}: نوع باید درآمد یا هزینه باشد`);
  }

  let categoryId: number | null = null;
  if (row.category_id !== null && row.category_id !== undefined) {
    const parsed = Number(row.category_id);
    if (!Number.isInteger(parsed) || !categoryIds.has(parsed)) {
      fail(`${label}: دسته‌بندی مرتبط در فایل پیدا نشد`);
    }
    categoryId = parsed;
  }

  const date = typeof row.date === 'string' ? row.date : '';
  if (!date || Number.isNaN(new Date(date).getTime())) {
    fail(`${label}: تاریخ نامعتبر است`);
  }

  const shamsiDate = typeof row.shamsi_date === 'string' && row.shamsi_date ? row.shamsi_date : '';
  if (!shamsiDate) {
    fail(`${label}: تاریخ شمسی خالی است`);
  }

  const note = typeof row.note === 'string' && row.note.trim() ? row.note.trim() : null;
  const createdAt =
    typeof row.created_at === 'string' && row.created_at ? row.created_at : toLocalIso(new Date());

  return {
    id,
    amount,
    type,
    category_id: categoryId,
    date,
    shamsi_date: shamsiDate,
    note,
    created_at: createdAt,
    // اتصال به حساب بانکی هم پشتیبان‌گیری می‌شود؛ در فایل‌های قدیمی وجود ندارد و
    // نبودش یعنی «تراکنش دستی».
    bank_account_id:
      typeof row.bank_account_id === 'number' ? row.bank_account_id : null,
  };
}

/** اعتبارسنجی حساب بانکی داخل فایل پشتیبان (اختیاری، برای فایل‌های قدیمی). */
function parseBankAccount(
  value: unknown,
  index: number,
  seenIds: Set<number>,
): BankAccount {
  const label = `حساب بانکی شماره ${index + 1}`;
  const row = asRecord(value) ?? fail(`${label}: ساختار نامعتبر است`);

  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) {
    fail(`${label}: شناسه نامعتبر است`);
  }
  if (seenIds.has(id)) {
    fail(`${label}: شناسه تکراری است`);
  }
  seenIds.add(id);

  const bankCode = typeof row.bank_code === 'string' ? row.bank_code.trim() : '';
  if (!bankCode) fail(`${label}: بانک مشخص نیست`);

  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (!title) fail(`${label}: نام حساب خالی است`);

  const senders = Array.isArray(row.senders)
    ? row.senders.filter((item): item is string => typeof item === 'string')
    : [];

  const initialBalance = Number(row.initial_balance);
  const currentBalance = Number(row.current_balance);

  return {
    id,
    bank_code: bankCode,
    title,
    account_number: typeof row.account_number === 'string' && row.account_number ? row.account_number : null,
    senders,
    initial_balance: Number.isFinite(initialBalance) ? Math.trunc(initialBalance) : 0,
    current_balance: Number.isFinite(currentBalance) ? Math.trunc(currentBalance) : 0,
    include_roundup: Boolean(row.include_roundup),
    // فایل‌های قدیمی این کلید را ندارند؛ نبودش یعنی «اعلام صوتی خاموش».
    announceVoice: Boolean(row.announceVoice ?? row.announce_voice),
    is_active: row.is_active !== false,
    created_at:
      typeof row.created_at === 'string' && row.created_at
        ? row.created_at
        : toLocalIso(new Date()),
    sync_from_ts: Number.isFinite(Number(row.sync_from_ts)) ? Number(row.sync_from_ts) : 0,
    balance_anchor_ts: Number.isFinite(Number(row.balance_anchor_ts))
      ? Number(row.balance_anchor_ts)
      : 0,
  };
}

/** اعتبارسنجی فایل پشتیبان قبل از دست زدن به دیتابیس. */
export function parseBackup(json: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    fail('فایل JSON معتبر نیست');
  }

  const root = asRecord(raw) ?? fail('ساختار فایل پشتیبان درست نیست');
  if (root.app !== BACKUP_APP_ID) {
    fail('این فایل متعلق به دارینو نیست');
  }
  if (root.version !== BACKUP_VERSION) {
    fail('نسخه‌ی این فایل پشتیبان پشتیبانی نمی‌شود');
  }
  if (!Array.isArray(root.categories)) {
    fail('فهرست دسته‌بندی‌ها در فایل نیست');
  }
  if (!Array.isArray(root.transactions)) {
    fail('فهرست تراکنش‌ها در فایل نیست');
  }

  const categoryIds = new Set<number>();
  const categories = root.categories.map((item, index) =>
    parseCategory(item, index, categoryIds),
  );

  const transactionIds = new Set<number>();
  const transactions = root.transactions.map((item, index) =>
    parseTransaction(item, index, categoryIds, transactionIds),
  );

  let bankAccounts: BankAccount[] | undefined;
  if (root.bank_accounts !== undefined) {
    if (!Array.isArray(root.bank_accounts)) {
      fail('فهرست حساب‌های بانکی معتبر نیست');
    }
    const accountIds = new Set<number>();
    bankAccounts = root.bank_accounts.map((item, index) =>
      parseBankAccount(item, index, accountIds),
    );
  }

  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exported_at: typeof root.exported_at === 'string' ? root.exported_at : '',
    categories,
    transactions,
    ...(bankAccounts ? { bank_accounts: bankAccounts } : {}),
  };
}

export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}
