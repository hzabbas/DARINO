import { findAccountBySender, isBeforeSyncWindow, listBankAccounts, setAccountBalance } from '../db/bankAccounts';
import { insertPendingSms, linkPendingPair, listPendingSms } from '../db/pendingSms';
import type { BankAccount, PendingSms, SqlDatabase } from '../types/models';
import { sendersMatch } from '../utils/iranianBanks';
import { toLocalIso } from '../utils/jalali';
import {
  createSmsId,
  detectSelfTransfers,
  normalizeSmsBody,
  parseBankSms,
  type ParsedSms,
} from '../utils/smsParser';
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

/** فاصله‌ای که دو ورودی یک پیامک (گیرنده‌ی بومی و صندوق پیامک) در آن یکی حساب می‌شوند. */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

/**
 * پیامک تکراری در صف، حول همان لحظه.
 *
 * گیرنده‌ی بومی پیامک را همان لحظه‌ی رسیدن با مهر PDU می‌فرستد و همگام‌سازی
 * صندوق پیامک همان پیامک را کمی دیرتر با مهر خود سیستم می‌خواند؛ اختلاف چند
 * ثانیه‌ای یا حتی رد شدن از مرز یک دقیقه نباید دو ردیف بسازد. تطبیق «متن
 * یکدست‌شده + مبلغ» در پنجره‌ی ±۲ دقیقه این حالت را می‌گیرد.
 */
function findDuplicatePendingSms(
  db: SqlDatabase,
  input: { accountId: number; body: string; amount: number; timestamp: number },
): PendingSms | null {
  const from = toLocalIso(new Date(input.timestamp - DUPLICATE_WINDOW_MS));
  const to = toLocalIso(new Date(input.timestamp + DUPLICATE_WINDOW_MS));

  const rows = db.getAllSync<PendingSms>(
    `SELECT id, sms_id, sender, bank_account_id, raw_body, detected_type, amount, fee_amount,
            roundup_amount, detected_balance, date, shamsi_date, time, transfer_pair_id, status,
            created_at, merchant, suggested_category_id
       FROM pending_sms
      WHERE bank_account_id = ? AND date >= ? AND date <= ?`,
    input.accountId,
    from,
    to,
  );

  const bodyKey = normalizeSmsBody(input.body);
  const amount = Math.trunc(input.amount);
  return (
    rows.find(
      (row) => normalizeSmsBody(row.raw_body) === bodyKey && Math.trunc(row.amount) === amount,
    ) ?? null
  );
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

  const timestamp = receivedAt.getTime();
  const duplicate = findDuplicatePendingSms(db, {
    accountId: account.id,
    body: input.body,
    amount: parsed.amount,
    timestamp,
  });
  if (duplicate) {
    return { status: 'duplicate', parsed, pending: duplicate, account, suggestion: null };
  }

  const smsId = createSmsId({
    sender: input.sender,
    body: input.body,
    amount: parsed.amount,
    timestamp,
  });

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
    // پیامک می‌برد؛ پس تراکنش‌های دستی قبلی دوباره روی آن شمرده نمی‌شوند. اگر این
    // مانده از آخرین لنگر حساب قدیمی‌تر باشد، به‌عقب برنمی‌گردیم.
    setAccountBalance(db, account.id, parsed.balance, timestamp);
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

// ---------------------------------------------------------------------------
// سیگنال «کدام پیامک را همین حالا باز کن؟»
//
// وقتی کاربر روی نوتیفیکیشن پیامک بانکی می‌زند یا پیامک تازه‌ای وارد برنامه
// می‌شود، باید مستقیم روی همان تراکنش در صف تایید باز شود. این سیگنال سبک و
// بدون وابستگی است: لایه‌ی داده یا لینک عمیق آن را می‌دهد و داشبورد مصرف می‌کند.
// ---------------------------------------------------------------------------

export type PendingSmsFocus = {
  /** `sms_id` همان پیامک، اگر معلوم باشد */
  smsId: string | null;
  timestamp: number;
};

let pendingFocus: PendingSmsFocus | null = null;
const focusListeners = new Set<(focus: PendingSmsFocus) => void>();

/** درخواست باز کردن صف تایید؛ داشبورد فوراً آن را مصرف می‌کند. */
export function requestPendingSmsFocus(smsId: string | null = null, now = Date.now()): void {
  pendingFocus = { smsId, timestamp: now };
  for (const listener of focusListeners) {
    listener(pendingFocus);
  }
}

/** آخرین درخواست را برمی‌گرداند و پاک می‌کند (برای ورود اولیه به برنامه). */
export function consumePendingSmsFocus(): PendingSmsFocus | null {
  const current = pendingFocus;
  pendingFocus = null;
  return current;
}

/** آیا درخواست بی‌مصرفی وجود دارد؟ (بدون پاک کردن) */
export function peekPendingSmsFocus(): PendingSmsFocus | null {
  return pendingFocus;
}

/** اشتراک روی درخواست‌های تازه؛ خروجی، تابع لغو اشتراک است. */
export function subscribePendingSmsFocus(
  listener: (focus: PendingSmsFocus) => void,
): () => void {
  focusListeners.add(listener);
  return () => {
    focusListeners.delete(listener);
  };
}

/** فقط برای تست‌ها: وضعیت را به ابتدا برمی‌گرداند. */
export function resetPendingSmsFocus(): void {
  pendingFocus = null;
  focusListeners.clear();
}

/**
 * شناسه‌ی پیامک از روی «امضای» نوتیفیکیشن بومی.
 *
 * سمت اندروید لینک عمیق `darino://pending-sms?sms=<fingerprint>&open=1` را می‌فرستد؛
 * همان امضا در `SmsStore` روی ردیف پیامک هم ذخیره می‌شود تا بتوان ردیف را پیدا کرد.
 */
export function smsFingerprintFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = 'darino://';
  if (!url.startsWith(marker)) return null;

  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;

  for (const pair of url.slice(queryStart + 1).split('&')) {
    const [rawKey, rawValue] = pair.split('=');
    if (rawKey === 'sms' && rawValue) {
      return decodeURIComponent(rawValue);
    }
  }
  return null;
}

/** آیا این URL درخواست باز کردن صف تایید است؟ */
export function isPendingSmsUrl(url: string | null | undefined): boolean {
  if (!url || !url.startsWith('darino://')) return false;
  return url.includes('pending-sms') || url.includes('openPendingSms=1') || url.includes('open=1');
}

/**
 * تبدیل «امضای نوتیفیکیشن» به ردیف صف تایید.
 *
 * امضای بومی `sender|amount|minute|timestamp` است (نسخه‌ی قدیمی فقط
 * `sender|timestamp` بود)؛ در هر دو حالت مهر زمانی آخرین بخش است. برای پیدا کردن
 * ردیف، فرستنده با همان قاعده‌ی سرشماره‌ها و مهر زمانی در حد یک دقیقه تطبیق داده
 * می‌شود تا اختلاف چند ثانیه‌ای گیرنده و صندوق پیامک مشکلی نسازد.
 */
export function resolveFocusedSmsId(
  db: SqlDatabase,
  fingerprint: string | null,
  url: string | null = null,
): string | null {
  const raw = fingerprint ?? smsFingerprintFromUrl(url);
  if (!raw) return null;

  const parts = raw.split('|');
  if (parts.length < 2) return null;

  const sender = parts[0];
  const timestamp = Number(parts[parts.length - 1]);
  if (!Number.isFinite(timestamp)) return null;

  const match = listPendingSms(db, 'pending').find((row) => {
    const rowTime = new Date(row.date).getTime();
    if (!Number.isFinite(rowTime)) return false;
    return Math.abs(rowTime - timestamp) < 60_000 && sendersMatch(row.sender, sender);
  });
  return match?.sms_id ?? null;
}