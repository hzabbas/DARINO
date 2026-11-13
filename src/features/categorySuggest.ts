import { listCategories } from '../db/categories';
import type { SqlDatabase, TransactionType } from '../types/models';

/**
 * پیشنهاد خودکار دسته‌بندی برای پیامک‌های بانکی.
 *
 * دو منبع، به ترتیب اولویت:
 *  ۱) تاریخچه‌ی خودِ کاربر: همان فروشنده/طرف حساب قبلاً در کدام دسته ثبت شده
 *     (پیامک‌های تاییدشده نام فروشنده را در `note` تراکنش نگه می‌دارند)
 *  ۲) تطابق کلیدواژه: توکن‌های نام دسته‌بندی‌ها با توکن‌های نام فروشنده و متن پیامک
 *
 * خروجی همیشه «پیشنهاد» است؛ کاربر در صندوق تایید آن را می‌بیند و می‌تواند عوض کند.
 */
export interface CategorySuggestion {
  categoryId: number;
  source: 'history' | 'keyword';
  /** توضیح کوتاه فارسی برای نمایش زیر دسته‌بندی */
  reason: string;
}

/** برای تست‌ها و تشخیص «چرا این پیشنهاد آمد». */
export interface MerchantHistoryEntry {
  note: string;
  categoryId: number;
}

interface ScoredSuggestion {
  categoryId: number;
  score: number;
  detail: string;
}

/** حرف‌های بی‌معنی که هر پیامکی دارند و نباید کلیدواژه شوند. */
const STOP_WORDS = new Set([
  'حساب',
  'کارت',
  'بانک',
  'شماره',
  'مبلغ',
  'مانده',
  'موجودی',
  'تراکنش',
  'خرید',
  'برداشت',
  'واریز',
  'انتقال',
  'پرداخت',
  'ریال',
  'تومان',
  'تاریخ',
  'ساعت',
  'شده',
  'شد',
  'است',
  'بود',
  'برای',
  'بابت',
  'عزیز',
  'مشتری',
  'گرامی',
]);

const MIN_TOKEN_LENGTH = 3;

/**
 * متن را برای مقایسه‌ی کلیدواژه‌ای یکدست می‌کند: نیم‌فاصله، اعراب، ارقام و
 * نشانه‌ها حذف می‌شوند تا «قرض‌الحسنه» و «قرض الحسنه» یکی شوند.
 *
 * نیم‌فاصله به «فاصله» تبدیل می‌شود (نه حذف) تا توکن‌ها قابل مقایسه بمانند؛
 * نشانگرهای جهت‌دهی کاملاً دور ریخته می‌شوند.
 */
export function normalizeForMatch(input: string | null | undefined): string {
  return String(input ?? '')
    .replace(/[\u200b\u200c\u200e\u200f\u2060\ufeff\u00a0]/g, ' ')
    .replace(/[\u202a-\u202e\u2066-\u2069\u00ad]/g, '')
    .replace(/[\u064b-\u0652]/g, '')
    .replace(/[0-9۰-۹٠-٩]/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * کلیدواژه‌های پرتکرار فروشنده‌های ایرانی که نامشان با نام دسته‌بندی‌ها هم‌پوشانی
 * ندارد؛ با دیدن هر کدام، کلیدواژه‌های معادل به متن جست‌وجو اضافه می‌شود.
 *
 * مثلاً «افق کوروش» یک سوپرمارکت است و باید به «خوراک و مواد غذایی» برسد، در حالی
 * که هیچ‌کدام از توکن‌های نام آن دسته‌بندی در نام فروشنده نیست.
 */
const MERCHANT_HINTS: { tokens: string[]; categoryKeywords: string[] }[] = [
  { tokens: ['کوروش', 'افق', 'رفاه', 'جانبو', 'هایپر', 'سوپرمارکت', 'زنجیره', 'مارکت'], categoryKeywords: ['خوراک', 'غذایی'] },
  { tokens: ['بنزین', 'پمپ', 'سوخت', 'گازوئیل', 'جایگاه'], categoryKeywords: ['بنزین', 'سوخت'] },
  { tokens: ['کارواش', 'واش'], categoryKeywords: ['کارواش'] },
  { tokens: ['اتوسرویس', 'تعمیرگاه', 'مکانیکی', 'سرویس', 'تعمیر'], categoryKeywords: ['تعمیرات', 'نگهداری'] },
  { tokens: ['لاستیک', 'تایر', 'یدکی', 'روغن', 'فیلتر'], categoryKeywords: ['لاستیک', 'یدکی'] },
  { tokens: ['قبض', 'برق', 'گاز', 'مخابرات', 'بیمه'], categoryKeywords: ['قبوض', 'منزل'] },
  { tokens: ['شارژ', 'ایرانسل', 'همراه', 'اعتبار'], categoryKeywords: ['شارژ', 'تلفن'] },
  { tokens: ['اینترنت', 'شاتل', 'آسیاتک', 'مخابرات'], categoryKeywords: ['اینترنت'] },
  { tokens: ['اسنپ', 'تپسی', 'مسافر', 'پیک'], categoryKeywords: ['اسنپ'] },
  { tokens: ['حقوق', 'فیش', 'کارفرما'], categoryKeywords: ['حقوق', 'درآمد'] },
  { tokens: ['فروشگاه', 'دیجی', 'کالا', 'بامیلو', 'ترب', 'خرید'], categoryKeywords: ['متفرقه'] },
];

/** توکن‌های معنادار متن (بدون کلمه‌های بی‌معنی و کوتاه). */
export function significantTokens(input: string | null | undefined): string[] {
  return normalizeForMatch(input)
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token));
}

/** آیا این دو توکن به یک چیز اشاره می‌کنند؟ («قبض» و «قبوض») */
function tokensOverlap(first: string, second: string): boolean {
  if (first === second) return true;
  return first.length >= MIN_TOKEN_LENGTH && second.includes(first);
}

/** متن جست‌وجو را با کلیدواژه‌های فروشنده‌های شناخته‌شده گسترش می‌دهد. */
function expandWithHints(tokens: Set<string>): Set<string> {
  const expanded = new Set(tokens);

  for (const hint of MERCHANT_HINTS) {
    const matched = hint.tokens.some((hintToken) =>
      [...tokens].some((token) => tokensOverlap(token, hintToken)),
    );
    if (!matched) continue;

    for (const keyword of hint.categoryKeywords) {
      expanded.add(keyword);
    }
  }

  return expanded;
}

/**
 * تاریخچه‌ی «این نام فروشنده در چه دسته‌ای ثبت شده».
 * فقط تراکنش‌های همان نوع (هزینه/درآمد) و فقط نوترین‌ها خوانده می‌شوند تا
 * کوئری روی دیتابیس بزرگ هم ارزان بماند.
 */
export function loadMerchantHistory(
  db: SqlDatabase,
  type: TransactionType,
  limit = 500,
): MerchantHistoryEntry[] {
  return db
    .getAllSync<{ note: string; category_id: number }>(
      `SELECT note, category_id FROM transactions
       WHERE type = ? AND note IS NOT NULL AND TRIM(note) <> '' AND category_id IS NOT NULL
       ORDER BY id DESC
       LIMIT ?`,
      type,
      limit,
    )
    .map((row) => ({ note: row.note, categoryId: row.category_id }));
}

/** بهترین دسته بر اساس تاریخچه؛ تطابق کامل از تطابق جزئی وزن بیشتری دارد. */
export function suggestFromHistory(
  history: MerchantHistoryEntry[],
  merchant: string | null,
): ScoredSuggestion | null {
  const needle = normalizeForMatch(merchant);
  if (!needle) return null;

  const scores = new Map<number, number>();

  for (const entry of history) {
    const note = normalizeForMatch(entry.note);
    if (!note) continue;

    let weight = 0;
    if (note === needle) weight = 2;
    else if (note.includes(needle) || needle.includes(note)) weight = 1;
    else continue;

    scores.set(entry.categoryId, (scores.get(entry.categoryId) ?? 0) + weight);
  }

  if (scores.size === 0) return null;

  let best: ScoredSuggestion | null = null;
  for (const [categoryId, score] of scores) {
    // در تساوی امتیاز، اولین مورد (نوترین در تاریخچه) برنده است
    if (!best || score > best.score) {
      best = { categoryId, score, detail: merchant ?? '' };
    }
  }

  return best;
}

/** بهترین دسته بر اساس اشتراک توکن‌های نام دسته با نام فروشنده/متن پیامک. */
export function suggestFromKeywords(
  db: SqlDatabase,
  input: { type: TransactionType; merchant?: string | null; body?: string | null },
): ScoredSuggestion | null {
  const textTokens = new Set([
    ...significantTokens(input.merchant),
    ...significantTokens(input.body),
  ]);
  if (textTokens.size === 0) return null;

  const searchTokens = expandWithHints(textTokens);
  let best: ScoredSuggestion | null = null;

  for (const category of listCategories(db, input.type)) {
    const nameTokens = significantTokens(category.name);
    let score = 0;
    let matched = '';

    for (const token of nameTokens) {
      // هم‌پوشانی توکن‌ها («قبض» ↔ «قبوض») هم قبول است، نه فقط تطابق دقیق
      const hit = [...searchTokens].some((candidate) => tokensOverlap(token, candidate));
      if (!hit) continue;

      // توکن بلندتر سیگنال قوی‌تری است («بنزین» از «قبض» مطمئن‌تر است)
      score += token.length;
      if (token.length > matched.length) matched = token;
    }

    if (score === 0 || !matched) continue;
    if (!best || score > best.score) {
      best = { categoryId: category.id, score, detail: matched };
    }
  }

  return best;
}

export interface SuggestCategoryInput {
  /** فروشنده/طرف حساب استخراج‌شده از پیامک */
  merchant?: string | null;
  type: TransactionType;
  /** متن کامل پیامک؛ برای تطابق کلیدواژه‌ای وقتی نام فروشنده پیدا نشده */
  body?: string | null;
  /** برای تست: تاریخچه‌ی آماده به‌جای خواندن از دیتابیس */
  history?: MerchantHistoryEntry[];
}

/**
 * پیشنهاد نهایی دسته‌بندی: اول تاریخچه‌ی خود کاربر، بعد تطابق کلیدواژه.
 * اگر هیچ‌کدام چیزی پیدا نکنند null برمی‌گردد تا UI بدون پیشنهاد کار کند.
 */
export function suggestCategory(
  db: SqlDatabase,
  input: SuggestCategoryInput,
): CategorySuggestion | null {
  const merchant = input.merchant ?? null;

  if (merchant) {
    const history = input.history ?? loadMerchantHistory(db, input.type);
    const fromHistory = suggestFromHistory(history, merchant);
    if (fromHistory) {
      return {
        categoryId: fromHistory.categoryId,
        source: 'history',
        reason: `قبلاً برای «${merchant}» انتخاب شده بود`,
      };
    }
  }

  const fromKeywords = suggestFromKeywords(db, {
    type: input.type,
    merchant,
    body: input.body ?? null,
  });

  if (fromKeywords) {
    return {
      categoryId: fromKeywords.categoryId,
      source: 'keyword',
      reason: `کلیدواژه «${fromKeywords.detail}» در پیامک پیدا شد`,
    };
  }

  return null;
}
