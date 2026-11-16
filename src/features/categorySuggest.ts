import { listCategories } from '../db/categories';
import type { SqlDatabase, TransactionType } from '../types/models';

/**
 * Automatic category suggestion for bank SMS.
 * Two sources in priority order:
 *  1) User history: previous category selected for the same merchant
 *  2) Keyword match: category name tokens matched against merchant or SMS body
 */
export interface CategorySuggestion {
  categoryId: number;
  source: 'history' | 'keyword';
  /** Persian explanation displayed under category chip */
  reason: string;
}

/** Historical merchant entry for diagnostics and tests */
export interface MerchantHistoryEntry {
  note: string;
  categoryId: number;
}

interface ScoredSuggestion {
  categoryId: number;
  score: number;
  detail: string;
}

/** Non-informative stop words common in Iranian bank SMS */
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

/** Normalizes text for keyword matching */
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

/** High-frequency Iranian merchant keyword mappings */
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

/** Significant tokens (excluding stop words and short tokens) */
export function significantTokens(input: string | null | undefined): string[] {
  return normalizeForMatch(input)
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token));
}

/** Token overlap check */
function tokensOverlap(first: string, second: string): boolean {
  if (first === second) return true;
  return first.length >= MIN_TOKEN_LENGTH && second.includes(first);
}

/** Expands search tokens with merchant hints */
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

/** Loads merchant history for transaction type */
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

/** Pick best category from merchant history */
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
    // In tie, earliest match wins
    if (!best || score > best.score) {
      best = { categoryId, score, detail: merchant ?? '' };
    }
  }

  return best;
}

/** Pick best category from keywords in category name and message body */
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
      const hit = [...searchTokens].some((candidate) => tokensOverlap(token, candidate));
      if (!hit) continue;

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
  /** Extracted merchant from SMS */
  merchant?: string | null;
  type: TransactionType;
  /** Full SMS text */
  body?: string | null;
  /** Injected history for testing */
  history?: MerchantHistoryEntry[];
}

/** Suggests category based on history first, then keywords */
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
