import { toGregorian, toJalaali } from 'jalaali-js';

import { toLatinDigits } from './digits';
// Colloquial speech formatters exported for UI and native listeners.
export { buildColloquialDepositSpeech, formatColloquialSpeechAmount } from './numberToWords';
import { detectBankFromSender, normalizeSender, type IranianBank } from './iranianBanks';
import { toLocalIso } from './jalali';

export type SmsKind = 'transaction' | 'otp' | 'unknown';
export type SmsTransactionType = 'income' | 'expense';

/**
 * Transaction channel for category suggestions.
 * pos = card reader / store, online = internet purchase, card = card to card,
 * atm = ATM, paya = Paya / Satna / IBAN transfer.
 */
export type SmsChannel = 'pos' | 'online' | 'card' | 'atm' | 'paya';

/** Extracted merchant or party from SMS body. */
export interface SmsMerchant {
  merchant: string | null;
  channel: SmsChannel | null;
}

/** Currency unit used in SMS body (rial or toman). */
export type CurrencyUnit = 'rial' | 'toman';

export interface ParsedSms {
  kind: SmsKind;
  type: SmsTransactionType | null;
  bank: IranianBank | null;
  /** Primary amount in Toman. */
  amount: number;
  /** Transfer fee in Toman. */
  fee: number;
  /** Blu bank roundup amount in Toman. */
  roundup: number;
  /** Account balance after transaction in Toman. */
  balance: number | null;
  date: Date | null;
  dateIso: string | null;
  /** Shamsi date string YYYY/MM/DD. */
  shamsi: string | null;
  /** Time string HH:mm. */
  time: string | null;
  /** Reason when kind === 'otp'. */
  otpReason: string | null;
  /** Extracted merchant / counterparty name. */
  merchant: string | null;
  /** Transaction channel (pos, card, etc.). */
  channel: SmsChannel | null;
}

export interface SmsInput {
  sender: string;
  body: string;
  /** SMS reception timestamp fallback if date missing in text. */
  receivedAt?: Date;
}

/** Spaced thousands groups: e.g. 1 200 000. */
const SPACED_GROUPS = /\b\d{1,3}(?:[ \u00a0]\d{3}){1,}\b/g;

/** Slash thousands groups: e.g. 1/200/000. */
const SLASH_GROUPS = /\b\d{1,3}(?:\/\d{3}){1,}\b/g;

/**
 * Normalize SMS body for numerical extraction and delimiters.
 */
function normalize(body: string): string {
  let text = toLatinDigits(body)
    .replace(/[\u200c\u200e\u200f]/g, ' ')
    .replace(/\u066c/g, ',')
    .replace(/\u066b/g, ',')
    .replace(/،/g, ',')
    .replace(/[’‘']/g, ',')
    .replace(/\r/g, '');

  text = text.replace(SPACED_GROUPS, (match) => match.replace(/[ \u00a0]/g, ','));
  text = text.replace(SLASH_GROUPS, (match) => match.replace(/\//g, ','));
  return text;
}

function toNumber(raw: string | undefined | null): number {
  if (!raw) return 0;
  const digits = toLatinDigits(raw).replace(/[^0-9]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}

/** Convert Rial to Toman. */
export function rialToToman(rial: number): number {
  return Math.round(rial / 10);
}

/** Currency unit directly attached to number. */
function unitOf(raw: string | undefined | null): CurrencyUnit | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (value.includes('تومان') || value.includes('تومن') || value.includes('toman')) {
    return 'toman';
  }
  if (
    value.includes('ریال') ||
    value.includes('ريال') ||
    value.includes('rial') ||
    value.includes('irr')
  ) {
    return 'rial';
  }
  return null;
}

/**
 * Detect primary currency unit across the SMS.
 */
export function detectSmsUnit(text: string): CurrencyUnit | null {
  const lower = text.toLowerCase();
  const hasRial =
    lower.includes('ریال') ||
    lower.includes('ريال') ||
    lower.includes('rial') ||
    lower.includes('irr');
  const hasToman =
    lower.includes('تومان') || lower.includes('تومن') || lower.includes('toman');

  if (hasRial && hasToman) return null;
  if (hasToman) return 'toman';
  if (hasRial) return 'rial';
  return null;
}

/** Convert SMS amount to Toman (explicit unit -> message unit -> rial fallback). */
export function smsValueToToman(
  value: number,
  unit: CurrencyUnit | null,
  messageUnit: CurrencyUnit | null,
): number {
  const effective = unit ?? messageUnit ?? 'rial';
  return effective === 'toman' ? Math.trunc(value) : rialToToman(value);
}

/**
 * Merchant and counterparty extraction patterns.
 */
const MERCHANT_RULES: { pattern: RegExp; channel: SmsChannel | null; fallback?: string }[] = [
  // Online and POS purchases
  { pattern: /خرید\s*اینترنتی\s*(?:از\s*)?([^\d\n،,]{2,40})/, channel: 'online' },
  { pattern: /خرید\s*(?:از\s*)?(?:فروشگاه\s*)?([^\d\n،,]{2,40})/, channel: 'pos' },
  { pattern: /(?:در|از)\s*فروشگاه\s*([^\d\n،,]{2,40})/, channel: 'pos' },
  { pattern: /پرداخت\s*(?:از\s*)?(?:کارت\s*)?([^\d\n،,]{2,40})/, channel: 'pos' },
  // Card to card transfers
  { pattern: /(?:انتقال\s*)?کارت\s*به\s*کارت\s*(?:به|از)?\s*([^\d\n،,]{2,40})/, channel: 'card' },
  { pattern: /انتقال\s*(?:وجه)?\s*به\s*([^\d\n،,]{2,40})/, channel: 'card' },
  { pattern: /انتقال\s*(?:وجه)?\s*از\s*([^\d\n،,]{2,40})/, channel: 'card' },
  // Paya / Satna / IBAN transfers
  { pattern: /(?:پایا|ساتنا|شبا)\s*(?:به|از)?\s*([^\d\n،,]{2,40})/, channel: 'paya' },
  // ATM
  {
    pattern: /(?:برداشت|دریافت)\s*از\s*(?:خودپرداز|عابر\s*بانک|عابربانک)\s*([^\d\n،,]{2,40})/,
    channel: 'atm',
  },
  { pattern: /(?:خودپرداز|عابر\s*بانک|عابربانک)\s*([^\d\n،,]{2,40})/, channel: 'atm' },
  // Deposit and salary
  { pattern: /واریز\s*(?:وجه)?\s*از\s*([^\d\n،,]{2,40})/, channel: null },
  { pattern: /دریافت\s*از\s*([^\d\n،,]{2,40})/, channel: null },
  { pattern: /واریز\s*(?:حقوق|فیش\s*حقوقی)/, channel: null, fallback: 'حقوق' },
  { pattern: /حقوق\s*ماه(?:انه)?/, channel: null, fallback: 'حقوق' },
  // Second-line withdrawal merchant
  { pattern: /(?:^|\n)\s*برداشت\s+([^\d\n،,:]{2,40})/, channel: 'pos' },
];

/** Stop words that cannot be merchant names. */
const MERCHANT_STOP_WORDS = new Set([
  'حساب',
  'کارت',
  'شماره',
  'بانک',
  'مبلغ',
  'موجودی',
  'مانده',
  'تراکنش',
  'برداشت',
  'واریز',
  'انتقال',
  'خرید',
  'پرداخت',
  'موفق',
  'انجام',
  'شد',
]);

/** Clean merchant name from noise characters, digits, and extra spaces. */
export function cleanMerchant(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const cleaned = raw
    .replace(/[*#]+/g, ' ')
    .replace(/[\d۰-۹٠-٩]+/g, ' ')
    .replace(/[«»"'()\[\]{}|_\\/]/g, ' ')
    .replace(/[،,:;.…-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*و\s+/g, '')
    .replace(/\s+و\s*$/g, '')
    .trim();

  if (cleaned.length < 2) return null;
  if (MERCHANT_STOP_WORDS.has(cleaned)) return null;
  if (!/[\u0600-\u06ffA-Za-z]/.test(cleaned)) return null;

  return cleaned.length > 40 ? cleaned.slice(0, 40).trim() : cleaned;
}

/** Extract merchant and transaction channel from SMS body. */
export function extractMerchant(text: string): SmsMerchant {
  for (const rule of MERCHANT_RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;

    const merchant = cleanMerchant(match[1] ?? rule.fallback ?? null);
    if (merchant) {
      return { merchant, channel: rule.channel };
    }
  }

  return { merchant: null, channel: null };
}

/** Payer name detection patterns in deposit SMS. */
const PAYER_PATTERNS: RegExp[] = [
  /از\s*طرف\s*[:：]?\s*([^\d\n،,:;]{2,40})/,
  /توسط\s*[:：]?\s*([^\d\n،,:;]{2,40})/,
  /(?:نام\s*)?واریز\s*کننده\s*[:：]?\s*([^\d\n،,:;]{2,40})/,
  /(?:نام\s*)?واريز\s*كننده\s*[:：]?\s*([^\d\n،,:;]{2,40})/,
  /بنام\s*[:：]?\s*([^\d\n،,:;]{2,40})/,
  /به\s*نام\s+([^\d\n،,:;]{2,40})/,
  /واریز\s*(?:وجه)?\s*از\s+([^\d\n،,:;]{2,40})/,
  /دریافت\s*از\s+([^\d\n،,:;]{2,40})/,
];

/** From/To pattern bounded by Persian text. */
const PAYER_FROM_TO_PATTERN =
  /(?:^|\n|،|,)\s*از\s+([\u0600-\u06ff][\u0600-\u06ff\s]{1,30}?)\s+به\s/;

/** Stop words that cannot be payer names. */
const PAYER_STOP_WORDS = new Set([
  'حساب',
  'کارت',
  'شماره',
  'بانک',
  'مبلغ',
  'موجودی',
  'مانده',
  'تراکنش',
  'برداشت',
  'واریز',
  'انتقال',
  'خرید',
  'پرداخت',
  'موفق',
  'انجام',
  'شد',
  'شده',
  'از',
  'به',
  'طرف',
  'توسط',
  'نام',
  'کننده',
  'شما',
  'حسابتان',
  'کارتتان',
  'خودپرداز',
  'عابر',
]);

/** Bank phrases to strip from the end of extracted names. */
const PAYER_TRAILING_TOKENS = [
  'به حساب شما',
  'به حساب',
  'به کارت شما',
  'به کارت',
  'به شماره',
  'به',
  'طی',
  'مستند',
  'مانده',
  'موجودی',
  'حساب',
  'کارت',
  'شماره',
  'واریز',
  'انتقال',
  'بانک',
  'از',
  'و',
];

/** Clean raw extracted payer name. */
export function cleanPayerName(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw
    .replace(/[\d۰-۹٠-٩]+/g, ' ')
    .replace(/[«»"'()\[\]{}|_\\/*#+]+/g, ' ')
    .replace(/[،,:;.…\-–_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const token of PAYER_TRAILING_TOKENS) {
      if (value === token) {
        value = '';
        changed = true;
      } else if (value.endsWith(` ${token}`)) {
        value = value.slice(0, value.length - token.length - 1).trim();
        changed = true;
      }
    }
  }

  if (value.length < 2) return null;

  // Persian letters and spaces only.
  if (!/^[\u0600-\u06ff\s]+$/.test(value)) return null;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return null;
  if (words.some((word) => PAYER_STOP_WORDS.has(word))) return null;

  return words.join(' ');
}

/** Extract payer name from deposit SMS body. */
export function extractPayerName(body: string): string | null {
  if (!body) return null;
  const text = normalize(body);

  for (const pattern of PAYER_PATTERNS) {
    const match = text.match(pattern);
    const name = cleanPayerName(match?.[1]);
    if (name) return name;
  }

  const fromTo = text.match(PAYER_FROM_TO_PATTERN);
  return cleanPayerName(fromTo?.[1]);
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
  amountValue: number;
  /** Unit directly attached to amount value. */
  amountUnit: CurrencyUnit | null;
  feeValue: number;
  feeUnit: CurrencyUnit | null;
  roundupValue: number;
  roundupUnit: CurrencyUnit | null;
  balanceValue: number | null;
  balanceUnit: CurrencyUnit | null;
  jy: number | null;
  jm: number | null;
  jd: number | null;
  time: string | null;
}

function emptyDetection(): RawDetection {
  return {
    type: null,
    amountValue: 0,
    amountUnit: null,
    feeValue: 0,
    feeUnit: null,
    roundupValue: 0,
    roundupUnit: null,
    balanceValue: null,
    balanceUnit: null,
    jy: null,
    jm: null,
    jd: null,
    time: null,
  };
}

interface ParsedValue {
  value: number;
  unit: CurrencyUnit | null;
}

/** Parse balance from SMS body. */
function parseBalance(text: string): ParsedValue | null {
  const afterLabel = text.match(
    /مانده\s*[:：]\s*([\d,]{4,})\s*((?:ریال|ريال|تومان|تومن|rial|irr|toman)?)/i,
  );
  if (afterLabel) return { value: toNumber(afterLabel[1]), unit: unitOf(afterLabel[2]) };

  const beforeLabel = text.match(
    /([\d,]{4,})\s*((?:ریال|ريال|تومان|تومن|rial|irr|toman)?)\s*[:：]\s*مانده/i,
  );
  if (beforeLabel) return { value: toNumber(beforeLabel[1]), unit: unitOf(beforeLabel[2]) };

  const inventory = text.match(
    /(?:موجودی|مانده)\s*(?:حساب)?\s*[:：]?\s*([\d,]{4,})\s*((?:ریال|ريال|تومان|تومن|rial|irr|toman))/i,
  );
  if (inventory) return { value: toNumber(inventory[1]), unit: unitOf(inventory[2]) };

  return null;
}

/** Blu bank parser. */
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
    result.amountValue = toNumber(expense[1]);
    result.amountUnit = 'rial';
  } else if (income) {
    result.type = 'income';
    result.amountValue = toNumber(income[1]);
    result.amountUnit = 'rial';
  }

  if (!result.amountValue) return null;

  const roundup = text.match(/([\d,]{3,})\s*ریال\s*هم\s*رند\s*شد/);
  if (roundup) {
    result.roundupValue = toNumber(roundup[1]);
    result.roundupUnit = 'rial';
  }

  const balance = parseBalance(text);
  if (balance) {
    result.balanceValue = balance.value;
    result.balanceUnit = balance.unit;
  }
  return result;
}

/** Pasargad parser (sign prefix: e.g. +940,000, -4,811,000). */
function parsePasargad(text: string): RawDetection | null {
  const result = emptyDetection();

  const line = text.match(
    /(?:^|\n)\s*([+-])\s*([\d,]{3,})\s*((?:ریال|ريال|تومان|تومن|rial|irr|toman)?)\s*(?=\n|$)/i,
  );
  if (!line) return null;

  result.type = line[1] === '+' ? 'income' : 'expense';
  result.amountValue = toNumber(line[2]);
  result.amountUnit = unitOf(line[3]);

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

  const balance = parseBalance(text);
  if (balance) {
    result.balanceValue = balance.value;
    result.balanceUnit = balance.unit;
  }
  return result;
}

/** Mehr Iran parser (trailing sign: e.g. 4,800,000+, 5,011,000-). */
function parseTrailingSign(text: string): RawDetection | null {
  const result = emptyDetection();

  const line = text.match(
    /(?:^|\n)\s*([\d,]{3,})\s*([+-])\s*((?:ریال|ريال|تومان|تومن|rial|irr|toman)?)\s*(?=\n|$)/i,
  );
  if (!line) return null;

  result.type = line[2] === '+' ? 'income' : 'expense';
  result.amountValue = toNumber(line[1]);
  result.amountUnit = unitOf(line[3]);

  const jalaliDate = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})[-_ ]+(\d{1,2}:\d{2})/);
  if (jalaliDate) {
    result.jy = toNumber(jalaliDate[1]);
    result.jm = toNumber(jalaliDate[2]);
    result.jd = toNumber(jalaliDate[3]);
    result.time = jalaliDate[4];
  }

  const balance = parseBalance(text);
  if (balance) {
    result.balanceValue = balance.value;
    result.balanceUnit = balance.unit;
  }
  return result;
}

/** Generic bank parser (keywords + amount). */
function parseGeneric(text: string): RawDetection | null {
  const result = emptyDetection();

  const amount =
    text.match(
      /مبلغ\s*[:：]?\s*([\d,]{3,})\s*((?:ریال|ريال|تومان|تومن|rial|irr|toman)?)/i,
    ) ?? text.match(/([\d,]{3,})\s*((?:ریال|ريال|تومان|تومن|rial|irr|toman))/i);

  if (!amount) return null;
  result.amountValue = toNumber(amount[1]);
  result.amountUnit = unitOf(amount[2]);
  if (!result.amountValue) return null;

  const hasIncome = INCOME_WORDS.test(text);
  const hasExpense = EXPENSE_WORDS.test(text);

  if (hasIncome && !hasExpense) result.type = 'income';
  else if (hasExpense && !hasIncome) result.type = 'expense';
  else if (hasIncome && hasExpense) {
    // If both keywords exist, first word order decides.
    const incomeIndex = text.search(INCOME_WORDS);
    const expenseIndex = text.search(EXPENSE_WORDS);
    result.type = incomeIndex < expenseIndex ? 'income' : 'expense';
  }

  if (!result.type) return null;

  const balance = parseBalance(text);
  if (balance) {
    result.balanceValue = balance.value;
    result.balanceUnit = balance.unit;
  }
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

  // If text lacks date, fallback to SMS reception date.
  if (!detection.jm || !detection.jd) {
    const parts = toJalaali(receivedAt);
    return {
      date: receivedAt,
      shamsi: `${parts.jy}/${String(parts.jm).padStart(2, '0')}/${String(parts.jd).padStart(2, '0')}`,
      time: detection.time,
    };
  }

  // Pasargad omits year; if parsed date is in future, adjust year.
  const referenceYear = toJalaali(receivedAt).jy;
  let jy = detection.jy ?? referenceYear;
  if (detection.jy === null) {
    const candidate = toGregorian(jy, detection.jm, detection.jd);
    const candidateDate = new Date(candidate.gy, candidate.gm - 1, candidate.gd, hours, minutes, 0);
    if (candidateDate.getTime() - receivedAt.getTime() > 30 * 86_400_000) {
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
 * Complete bank SMS parser.
 */
export function parseBankSms({ sender, body, receivedAt = new Date() }: SmsInput): ParsedSms {
  const text = normalize(body);
  const bank = detectBankFromSender(sender, text);
  const { merchant, channel } = extractMerchant(text);

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
      merchant: null,
      channel: null,
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

  if (!detection || !detection.type || !detection.amountValue) {
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
      merchant,
      channel,
    };
  }

  const { date, shamsi, time } = buildDate(detection, receivedAt);

  // Message unit dictates whether Rial to Toman division is needed.
  const messageUnit = detectSmsUnit(text);

  return {
    kind: 'transaction',
    type: detection.type,
    bank,
    amount: smsValueToToman(detection.amountValue, detection.amountUnit, messageUnit),
    fee: smsValueToToman(detection.feeValue, detection.feeUnit, messageUnit),
    roundup: smsValueToToman(detection.roundupValue, detection.roundupUnit, messageUnit),
    balance:
      detection.balanceValue === null
        ? null
        : smsValueToToman(detection.balanceValue, detection.balanceUnit, messageUnit),
    date,
    dateIso: toLocalIso(date),
    shamsi,
    time,
    otpReason: null,
    merchant,
    channel,
  };
}

/** Normalize SMS body for identity comparison. */
export function normalizeSmsBody(body: string): string {
  return toLatinDigits(body ?? '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u00ad\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SmsIdInput {
  sender: string;
  body: string;
  /** Amount in Toman (0 if non-transactional). */
  amount: number;
  /** Reception timestamp in ms. */
  timestamp: number;
}

/**
 * Generate unique SMS identifier for deduplication.
 */
export function createSmsId(input: SmsIdInput): string {
  const minute = Number.isFinite(input.timestamp)
    ? Math.floor(Math.trunc(input.timestamp) / 60_000)
    : 0;
  const signature = [
    normalizeSender(input.sender),
    normalizeSmsBody(input.body),
    Math.trunc(input.amount),
    minute,
  ].join('|');

  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
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
  /** Fee in Toman. */
  fee: number;
}

/**
 * Detect self transfers between user's accounts within time gap.
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
    let best: { income: TransferCandidate; diff: number; gap: number } | null = null;

    for (const income of incomes) {
      if (usedIncome.has(income.id)) continue;
      if (income.bankAccountId === expense.bankAccountId) continue;

      const gap = Math.abs(new Date(income.dateIso).getTime() - expenseTime);
      if (!Number.isFinite(gap) || gap > maxGapMs) continue;
      if (income.amount > expense.amount) continue;

      const diff = expense.amount - income.amount;
      if (diff > maxFee) continue;

      if (!best || diff < best.diff || (diff === best.diff && gap < best.gap)) {
        best = { income, diff, gap };
      }
    }

    if (best) {
      usedIncome.add(best.income.id);
      links.push({ expenseId: expense.id, incomeId: best.income.id, fee: best.diff });
    }
  }

  return links;
}
