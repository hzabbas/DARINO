import { toGregorian, toJalaali } from 'jalaali-js';

import { toLatinDigits } from './digits';
import { detectBankFromSender, type IranianBank } from './iranianBanks';
import { toLocalIso } from './jalali';

export type SmsKind = 'transaction' | 'otp' | 'unknown';
export type SmsTransactionType = 'income' | 'expense';

export interface ParsedSms {
  kind: SmsKind;
  type: SmsTransactionType | null;
  bank: IranianBank | null;
  /** مبلغ اصلی به تومان */
  amount: number;
  /** کارمزد به تومان (برای انتقال بین حساب‌ها) */
  fee: number;
  /** مبلغ رندشده‌ی بلوبانک به تومان */
  roundup: number;
  /** مانده‌ی حساب پس از تراکنش، به تومان */
  balance: number | null;
  date: Date | null;
  dateIso: string | null;
  /** ۱۴۰۵/۰۸/۲۰ */
  shamsi: string | null;
  /** 21:53 */
  time: string | null;
  /** دلیل نادیده‌گرفتن، وقتی kind === 'otp' */
  otpReason: string | null;
}

export interface SmsInput {
  sender: string;
  body: string;
  /** زمان دریافت پیامک؛ اگر متن تاریخ نداشت از این استفاده می‌شود */
  receivedAt?: Date;
}

const PERSIAN_DIGITS_PATTERN = /[۰-۹٠-٩]/;

function normalize(body: string): string {
  return toLatinDigits(body)
    .replace(/[\u200c\u200e\u200f]/g, ' ')
    .replace(/\u066b/g, ',')
    .replace(/،/g, ',')
    .replace(/\r/g, '');
}

function toNumber(raw: string | undefined | null): number {
  if (!raw) return 0;
  const digits = toLatinDigits(raw).replace(/[^0-9]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}

/** ریال → تومان */
export function rialToToman(rial: number): number {
  return Math.round(rial / 10);
}

const OTP_RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /@ib\./i, reason: 'لینک رمز پویا (@ib)' },
  { pattern: /رمز\s*[:：]?\s*\d{3,}/, reason: 'رمز پویا' },
  { pattern: /رمز\s*پویا/, reason: 'رمز پویا' },
  { pattern: /کد\s*تأیید|کد\s*تایید/, reason: 'کد تایید' },
  { pattern: /\bOTP\b/i, reason: 'OTP' },
  { pattern: /فروش\s*مستقیم/, reason: 'فروش مستقیم بسته' },
];

function detectOtp(text: string): string | null {
  for (const rule of OTP_RULES) {
    if (rule.pattern.test(text)) return rule.reason;
  }
  return null;
}

const INCOME_WORDS = /(واریز|بستانکار|افزایش موجودی|دریافت|به حساب شما نشست|واریز پول|دریافت پل)/;
const EXPENSE_WORDS = /(برداشت|بدهکار|کاهش موجودی|خرید|انتقال|قبض|پرداخت|از حساب شما پرید|کسر شد)/;

interface RawDetection {
  type: SmsTransactionType | null;
  amountRial: number;
  feeRial: number;
  roundupRial: number;
  balanceRial: number | null;
  jy: number | null;
  jm: number | null;
  jd: number | null;
  time: string | null;
}

function emptyDetection(): RawDetection {
  return {
    type: null,
    amountRial: 0,
    feeRial: 0,
    roundupRial: 0,
    balanceRial: null,
    jy: null,
    jm: null,
    jd: null,
    time: null,
  };
}

function parseBalance(text: string): number | null {
  const afterLabel = text.match(/مانده\s*[:：]\s*([\d,]{4,})/);
  if (afterLabel) return toNumber(afterLabel[1]);

  const beforeLabel = text.match(/([\d,]{4,})\s*[:：]\s*مانده/);
  if (beforeLabel) return toNumber(beforeLabel[1]);

  const inventory = text.match(/(?:موجودی|مانده)\s*(?:حساب)?\s*[:：]?\s*([\d,]{4,})\s*ریال/);
  if (inventory) return toNumber(inventory[1]);

  return null;
}

/** بلوبانک: «1,611,500 ریال از حساب شما پرید» / «530,000 ریال به حساب شما نشست» */
function parseBlu(text: string): RawDetection | null {
  const result = emptyDetection();

  const expense =
    text.match(/([\d,]{3,})\s*ریال\s*(?:از حساب شما|از حسابتان)\s*پرید/) ??
    text.match(/(?:برداشت|خرید|پرداخت)[^\d\n]{0,40}?([\d,]{3,})\s*ریال/) ??
    text.match(/([\d,]{3,})\s*ریال\s*(?:برداشت|کسر)\s*شد/);

  const income =
    text.match(/([\d,]{3,})\s*ریال\s*(?:به حساب شما|به حسابتان)\s*نشست/) ??
    text.match(/(?:واریز|دریافت)[^\d\n]{0,40}?([\d,]{3,})\s*ریال/);

  if (expense) {
    result.type = 'expense';
    result.amountRial = toNumber(expense[1]);
  } else if (income) {
    result.type = 'income';
    result.amountRial = toNumber(income[1]);
  }

  if (!result.amountRial) return null;

  const roundup = text.match(/([\d,]{3,})\s*ریال\s*هم\s*رند\s*شد/);
  if (roundup) result.roundupRial = toNumber(roundup[1]);

  result.balanceRial = parseBalance(text);
  return result;
}

/** پاسارگاد: علامت سمت چپ عدد («+940,000»، «-4,811,000») */
function parsePasargad(text: string): RawDetection | null {
  const result = emptyDetection();

  const line = text.match(/(?:^|\n)\s*([+-])\s*([\d,]{3,})\s*(?=\n|$)/);
  if (!line) return null;

  result.type = line[1] === '+' ? 'income' : 'expense';
  result.amountRial = toNumber(line[2]);

  const dateTime =
    text.match(/(\d{2})\/(\d{2})[_ ]+(\d{1,2}:\d{2})/) ??
    text.match(/(\d{2})\/(\d{2})\/(\d{2})[_ ]+(\d{1,2}:\d{2})/);

  if (dateTime) {
    if (dateTime.length === 4) {
      result.jm = toNumber(dateTime[1]);
      result.jd = toNumber(dateTime[2]);
      result.time = dateTime[3];
    } else {
      result.jy = 1400 + toNumber(dateTime[1]);
      result.jm = toNumber(dateTime[2]);
      result.jd = toNumber(dateTime[3]);
      result.time = dateTime[4];
    }
  }

  result.balanceRial = parseBalance(text);
  return result;
}

/** مهر ایران و مشابه‌ها: علامت سمت راست عدد («4,800,000+»، «5,011,000-») */
function parseTrailingSign(text: string): RawDetection | null {
  const result = emptyDetection();

  const line = text.match(/(?:^|\n)\s*([\d,]{3,})\s*([+-])\s*(?=\n|$)/);
  if (!line) return null;

  result.type = line[2] === '+' ? 'income' : 'expense';
  result.amountRial = toNumber(line[1]);

  const jalaliDate = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})[-_ ]+(\d{1,2}:\d{2})/);
  if (jalaliDate) {
    result.jy = toNumber(jalaliDate[1]);
    result.jm = toNumber(jalaliDate[2]);
    result.jd = toNumber(jalaliDate[3]);
    result.time = jalaliDate[4];
  }

  result.balanceRial = parseBalance(text);
  return result;
}

/** بانک‌های دیگر: کلیدواژه + مبلغ */
function parseGeneric(text: string): RawDetection | null {
  const result = emptyDetection();

  const amount =
    text.match(/مبلغ\s*[:：]?\s*([\d,]{3,})\s*ریال/) ??
    text.match(/([\d,]{3,})\s*ریال/);

  if (!amount) return null;
  result.amountRial = toNumber(amount[1]);
  if (!result.amountRial) return null;

  const hasIncome = INCOME_WORDS.test(text);
  const hasExpense = EXPENSE_WORDS.test(text);

  if (hasIncome && !hasExpense) result.type = 'income';
  else if (hasExpense && !hasIncome) result.type = 'expense';
  else if (hasIncome && hasExpense) {
    // اگر هر دو بود، ترتیب جمله تعیین می‌کند
    const incomeIndex = text.search(INCOME_WORDS);
    const expenseIndex = text.search(EXPENSE_WORDS);
    result.type = incomeIndex < expenseIndex ? 'income' : 'expense';
  }

  if (!result.type) return null;

  result.balanceRial = parseBalance(text);
  return result;
}

function currentJalaliYear(): number {
  return toJalaali(new Date()).jy;
}

function buildDate(
  detection: RawDetection,
  receivedAt: Date,
): { date: Date; shamsi: string; time: string | null } {
  const [hours, minutes] = (detection.time ?? '00:00').split(':').map((part) => toNumber(part));

  // اگر متن تاریخ نداشت، زمان دریافت پیامک ملاک است
  if (!detection.jm || !detection.jd) {
    const parts = toJalaali(receivedAt);
    return {
      date: receivedAt,
      shamsi: `${parts.jy}/${String(parts.jm).padStart(2, '0')}/${String(parts.jd).padStart(2, '0')}`,
      time: detection.time,
    };
  }

  // پاسارگاد سال را نمی‌نویسد؛ اگر تاریخ به آینده افتاد، یعنی مربوط به سال قبل است
  let jy = detection.jy ?? currentJalaliYear();
  if (detection.jy === null) {
    const candidate = toGregorian(jy, detection.jm, detection.jd);
    const candidateDate = new Date(candidate.gy, candidate.gm - 1, candidate.gd, hours, minutes, 0);
    if (candidateDate.getTime() - Date.now() > 30 * 86_400_000) {
      jy -= 1;
    }
  }

  const gregorian = toGregorian(jy, detection.jm, detection.jd);
  const date = new Date(gregorian.gy, gregorian.gm - 1, gregorian.gd, hours, minutes, 0);

  return {
    date,
    shamsi: `${jy}/${String(detection.jm).padStart(2, '0')}/${String(detection.jd).padStart(2, '0')}`,
    time: detection.time,
  };
}

/**
 * تحلیل کامل یک پیامک بانکی.
 *
 * ترتیب کار: نرمال‌سازی ارقام → فیلتر OTP → تشخیص بانک → استخراج مبلغ/مانده/تاریخ
 * → تبدیل ریال به تومان. خروجی برای `unknown` یعنی متن تراکنشی نبود.
 */
export function parseBankSms({ sender, body, receivedAt = new Date() }: SmsInput): ParsedSms {
  const text = normalize(body);
  const bank = detectBankFromSender(sender, text);

  const otpReason = detectOtp(text);
  if (otpReason) {
    return {
      kind: 'otp',
      type: null,
      bank,
      amount: 0,
      fee: 0,
      roundup: 0,
      balance: null,
      date: null,
      dateIso: null,
      shamsi: null,
      time: null,
      otpReason,
    };
  }

  const detection =
    (bank?.code === 'blu' ? parseBlu(text) : null) ??
    (bank?.code === 'pasargad' ? parsePasargad(text) : null) ??
    (bank?.code === 'mehr' ? parseTrailingSign(text) : null) ??
    parsePasargad(text) ??
    parseTrailingSign(text) ??
    parseBlu(text) ??
    parseGeneric(text);

  if (!detection || !detection.type || !detection.amountRial) {
    return {
      kind: 'unknown',
      type: null,
      bank,
      amount: 0,
      fee: 0,
      roundup: 0,
      balance: null,
      date: null,
      dateIso: null,
      shamsi: null,
      time: null,
      otpReason: null,
    };
  }

  const { date, shamsi, time } = buildDate(detection, receivedAt);

  return {
    kind: 'transaction',
    type: detection.type,
    bank,
    amount: rialToToman(detection.amountRial),
    fee: rialToToman(detection.feeRial),
    roundup: rialToToman(detection.roundupRial),
    balance: detection.balanceRial === null ? null : rialToToman(detection.balanceRial),
    date,
    dateIso: toLocalIso(date),
    shamsi,
    time,
    otpReason: null,
  };
}

/** شناسه‌ی یکتا برای جلوگیری از ثبت تکراری یک پیامک */
export function createSmsId(sender: string, body: string, timestamp: string): string {
  const input = `${sender}|${body}|${timestamp}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `sms_${(hash >>> 0).toString(16)}`;
}

export interface TransferCandidate {
  id: number;
  bankAccountId: number | null;
  type: SmsTransactionType;
  amount: number;
  dateIso: string;
}

export interface TransferLink {
  expenseId: number;
  incomeId: number;
  /** کارمزد به تومان */
  fee: number;
}

/**
 * تشخیص انتقال بین کارت‌های خود کاربر.
 *
 * شرط: دو پیامک از دو حساب مختلف، حداکثر ۱۰ دقیقه فاصله، برداشت ≥ واریز و
 * اختلاف کمتر از ۱۰٬۰۰۰ تومان (کارمزد کارت‌به‌کارت/پایا). نتیجه: هر دو تراکنش
 * «انتقال» می‌شوند و اختلاف به‌عنوان کارمزد ثبت می‌شود تا درآمد/هزینه‌ی کاذب نباشد.
 */
export function detectSelfTransfers(
  items: TransferCandidate[],
  options: { maxGapMs?: number; maxFee?: number } = {},
): TransferLink[] {
  const maxGapMs = options.maxGapMs ?? 10 * 60 * 1000;
  const maxFee = options.maxFee ?? 10_000;

  const expenses = items.filter((item) => item.type === 'expense');
  const incomes = items.filter((item) => item.type === 'income');
  const usedIncome = new Set<number>();
  const links: TransferLink[] = [];

  for (const expense of expenses) {
    const expenseTime = new Date(expense.dateIso).getTime();
    let best: { income: TransferCandidate; diff: number } | null = null;

    for (const income of incomes) {
      if (usedIncome.has(income.id)) continue;
      if (income.bankAccountId === expense.bankAccountId) continue;

      const gap = Math.abs(new Date(income.dateIso).getTime() - expenseTime);
      if (!Number.isFinite(gap) || gap > maxGapMs) continue;
      if (income.amount > expense.amount) continue;

      const diff = expense.amount - income.amount;
      if (diff > maxFee) continue;

      if (!best || diff < best.diff) {
        best = { income, diff };
      }
    }

    if (best) {
      usedIncome.add(best.income.id);
      links.push({ expenseId: expense.id, incomeId: best.income.id, fee: best.diff });
    }
  }

  return links;
}
