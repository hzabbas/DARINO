import { findAccountBySender, isBeforeSyncWindow, listBankAccounts, setAccountBalance } from '../db/bankAccounts';
import { insertPendingSms, linkPendingPair, listPendingSms } from '../db/pendingSms';
import type { BankAccount, PendingSms, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { createSmsId, detectSelfTransfers, parseBankSms, type ParsedSms } from '../utils/smsParser';
import { suggestCategory, type CategorySuggestion } from './categorySuggest';

export type IngestStatus =
  | 'queued'
  | 'duplicate'
  | 'ignored-otp'
  | 'ignored-unknown'
  | 'unmatched-account'
  | 'before-sync-window';

export interface IngestResult {
  status: IngestStatus;
  parsed: ParsedSms;
  pending: PendingSms | null;
  account: BankAccount | null;
  /** دسته‌بندی پیشنهادی برای این پیامک (اگر پیدا شده باشد) */
  suggestion: CategorySuggestion | null;
}

function matchAccount(db: SqlDatabase, sender: string, bankCode: string | undefined): BankAccount | null {
  const direct = findAccountBySender(db, sender);
  if (direct) return direct;
  if (!bankCode) return null;

  // اگر کاربر هنوز سرشماره‌ای اضافه نکرده باشد، تنها حساب همان بانک را حدس می‌زنیم
  const sameBank = listBankAccounts(db, true).filter((account) => account.bank_code === bankCode);
  const withoutSenders = sameBank.filter((account) => account.senders.length === 0);
  if (sameBank.length === 1 && withoutSenders.length === 1) return sameBank[0];
  return null;
}

/**
 * دریافت یک پیامک از هر منبعی (گیرنده‌ی بومی، همگام‌سازی یا شبیه‌ساز):
 * OTP و پیام‌های غیرتراکنشی رد می‌شوند، پیامک تکراری ثبت نمی‌شود، موجودی حساب
 * از مانده‌ی پیامک هم‌تراز می‌شود و انتقال‌های بین دو حساب خودِ کاربر جفت می‌شوند.
 */
export function ingestBankSms(
  db: SqlDatabase,
  input: { sender: string; body: string; receivedAt?: Date },
): IngestResult {
  const receivedAt = input.receivedAt ?? new Date();
  const parsed = parseBankSms({ sender: input.sender, body: input.body, receivedAt });

  if (parsed.kind === 'otp') {
    return { status: 'ignored-otp', parsed, pending: null, account: null, suggestion: null };
  }
  if (parsed.kind !== 'transaction' || !parsed.type || parsed.amount <= 0) {
    return { status: 'ignored-unknown', parsed, pending: null, account: null, suggestion: null };
  }

  const account = matchAccount(db, input.sender, parsed.bank?.code);
  if (!account) {
    return { status: 'unmatched-account', parsed, pending: null, account: null, suggestion: null };
  }

  // مرز همگام‌سازی حساب: پیامک‌های قبل از «از چه زمانی حساب را وصل کردم» وارد صف
  // نمی‌شوند. بدون این مرز، اولین اتصال حساب کل صندوق پیامک قدیمی را خالی می‌کند
  // و موجودی/دخل‌وخرج را با هم قاطی می‌کند.
  if (isBeforeSyncWindow(account, receivedAt)) {
    return { status: 'before-sync-window', parsed, pending: null, account, suggestion: null };
  }

  const smsId = createSmsId(input.sender, input.body, parsed.dateIso ?? toLocalIso(receivedAt));

  // پیشنهاد دسته‌بندی از تاریخچه‌ی خود کاربر یا کلیدواژه‌های پیامک؛ فقط پیشنهاد است
  // و کاربر در صندوق تایید می‌تواند عوضش کند.
  const suggestion = suggestCategory(db, {
    merchant: parsed.merchant,
    type: parsed.type,
    body: input.body,
  });

  const { inserted, row } = insertPendingSms(db, {
    sms_id: smsId,
    sender: input.sender,
    bank_account_id: account.id,
    raw_body: input.body,
    detected_type: parsed.type,
    amount: parsed.amount,
    fee_amount: 0,
    roundup_amount: parsed.roundup,
    detected_balance: parsed.balance,
    date: parsed.dateIso ?? toLocalIso(receivedAt),
    shamsi_date: parsed.shamsi ?? '',
    time: parsed.time,
    merchant: parsed.merchant,
    suggested_category_id: suggestion?.categoryId ?? null,
  });

  if (inserted && parsed.balance !== null) {
    // مانده‌ی اعلامی بانک «تنها منبع حقیقت» است و لنگر موجودی را به لحظه‌ی همین
    // پیامک می‌برد؛ پس تراکنش‌های دستی قبلی دوباره روی آن شمرده نمی‌شوند.
    setAccountBalance(db, account.id, parsed.balance, receivedAt.getTime());
  }

  if (inserted) {
    pairPendingTransfers(db);
  }

  return {
    status: inserted ? 'queued' : 'duplicate',
    parsed,
    pending: row,
    account,
    suggestion,
  };
}

/**
 * قفل «همگام‌سازی در جریان».
 *
 * همگام‌سازی پیامک از چند مسیر صدا زده می‌شود (اولین mount، رویداد active شدن
 * اپ و رفرش دستی). اگر دو مسیر هم‌زمان شروع شوند، یک پیامک می‌تواند دو بار
 * خوانده و پردازش شود. این قفل تضمین می‌کند در هر لحظه فقط یک اجرا فعال باشد؛
 * خروجی null یعنی «یک اجرا از قبل در جریان است، این نوبت را رد کن».
 */
let ingestLock = false;

export function acquireIngestLock(): (() => void) | null {
  if (ingestLock) return null;

  ingestLock = true;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    ingestLock = false;
  };
}

export function isIngestRunning(): boolean {
  return ingestLock;
}

/** فقط برای تست‌ها: قفل را آزاد می‌کند. */
export function resetIngestLock(): void {
  ingestLock = false;
}

/**
 * جفت‌کردن انتقال‌های بین حساب‌ها؛ فقط روی پیامک‌های تاییدنشده‌ی دو ساعت اخیر
 * اجرا می‌شود تا صف قدیمی دوباره پردازش نشود.
 */
export function pairPendingTransfers(db: SqlDatabase): number {
  const allRows = listPendingSms(db, 'pending').filter(
    (row) => row.detected_type === 'income' || row.detected_type === 'expense',
  );
  if (allRows.length < 2) return 0;

  // پنجره‌ی زمانی نسبت به تازه‌ترین پیامک سنجیده می‌شود، نه ساعت گوشی
  const newest = allRows.reduce(
    (max, row) => Math.max(max, new Date(row.date).getTime()),
    Number.NEGATIVE_INFINITY,
  );
  const rows = allRows.filter((row) => newest - new Date(row.date).getTime() <= 2 * 60 * 60 * 1000);

  const links = detectSelfTransfers(
    rows.map((row) => ({
      id: row.id,
      bankAccountId: row.bank_account_id,
      type: row.detected_type as 'income' | 'expense',
      amount: row.amount,
      dateIso: row.date,
    })),
  );

  for (const link of links) {
    linkPendingPair(db, link.expenseId, link.incomeId, link.fee);
  }

  return links.length;
}
