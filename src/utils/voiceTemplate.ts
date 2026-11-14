import { formatAmount } from './currency';
import { onlyDigits, toPersianDigits } from './digits';
import { buildColloquialDepositSpeech, formatColloquialSpeechAmount } from './numberToWords';

/**
 * جمله‌ی اعلام واریز، با قالب دلخواه کاربر.
 *
 * کاربر جای هر بخش جمله را با یک توکن فارسی مشخص می‌کند و بقیه‌ی متن آزاد است؛
 * مثلاً «{نام}، {مبلغ} تومن زد به کارتت».
 *
 * توکن‌های قدیمی لاتین (`{name}`، `{amount}`، …) هنوز پذیرفته می‌شوند تا
 * قالب‌های ذخیره‌شده‌ی نسخه‌های قبل بی‌صدا نشوند؛ ولی هنگام خواندن/ذخیره
 * خودکار به شکل فارسی مهاجرت می‌کنند.
 *
 * این فایل و `plugins/android/sms/SpeechTemplate.kt` باید **مو‌به‌مو** یکی
 * باشند: پیش‌نمایش این‌جا دیده می‌شود و همان جمله روی گوشی خوانده می‌شود. هر
 * تغییر در قاعده‌ها باید در هر دو طرف انجام شود و در
 * `tests/voiceTemplate.test.ts` پوشش داشته باشد.
 */

/** توکن‌های اصلی؛ همان چیزی که چیپ‌های ویرایشگر در جمله می‌گذارند. */
export const VOICE_TEMPLATE_TOKENS = ['نام', 'مبلغ', 'مبلغ_رقمی', 'بانک', 'کارت'] as const;

export type VoiceTemplateToken = (typeof VOICE_TEMPLATE_TOKENS)[number];

/** برچسب فارسی توکن‌ها برای چیپ‌های ویرایشگر. */
export const VOICE_TEMPLATE_TOKEN_LABELS: Record<VoiceTemplateToken, string> = {
  نام: 'نام واریزکننده',
  مبلغ: 'مبلغ با حروف',
  مبلغ_رقمی: 'مبلغ با رقم',
  بانک: 'نام بانک',
  کارت: '۴ رقم آخر کارت',
};

export const DEFAULT_VOICE_TEMPLATE = '{نام}، {مبلغ} تومن برات واریز کرد';

/** سقف طول جمله؛ بیشتر از این روی گوشی هم خواندنش طول می‌کشد و هم جای اشتباه دارد. */
export const VOICE_TEMPLATE_MAX_LENGTH = 160;

/** جمله‌های آماده؛ اولی همان پیش‌فرض است. */
export const VOICE_TEMPLATE_PRESETS: { label: string; template: string }[] = [
  { label: 'برات واریز کرد', template: DEFAULT_VOICE_TEMPLATE },
  { label: 'واریز کرد برات', template: '{نام}، {مبلغ} تومن واریز کرد برات' },
  { label: 'زد به کارتت', template: '{نام}، {مبلغ} تومن زد به کارتت' },
  { label: 'مبلغ و بانک', template: '{نام} {مبلغ} تومن به {بانک} واریز کرد' },
];

/** نقشه‌ی توکن‌های قدیمی به فارسی؛ برای مهاجرت خودکار قالب‌های ذخیره‌شده. */
const LEGACY_TOKEN_MAP: Record<string, string> = {
  name: 'نام',
  amount: 'مبلغ',
  amountNumber: 'مبلغ_رقمی',
  bank: 'بانک',
  card: 'کارت',
};

const LEGACY_TOKEN_PATTERN = /\{(name|amountNumber|amount|bank|card)\}/g;

/** قالب‌های نسخه‌های قبل را به توکن‌های فارسی تبدیل می‌کند. */
export function migrateVoiceTemplate(template: string): string {
  return template.replace(LEGACY_TOKEN_PATTERN, (_match, token: string) => {
    return `{${LEGACY_TOKEN_MAP[token] ?? token}}`;
  });
}

/**
 * کلاس فاصله‌های قابل حذف. عمداً ZWNJ (نیم‌فاصله) جزو آن نیست؛ وگرنه
 * «می‌شود» به «می شود» تبدیل می‌شد و گوینده اشتباه می‌خواند.
 */
const SPACE_CHARS = ' \\t\\n\\r\\f\\v\\u00A0\\u2000-\\u200B\\u202F';

const PUNCT_CHARS = '،,؛:.!؟?\\-–—';

const TOKEN_PATTERN = /\{(مبلغ_رقمی|مبلغ|نام|بانک|کارت|amountNumber|amount|name|bank|card)\}/g;

const SPACE_RUN = new RegExp(`[${SPACE_CHARS}]+`, 'g');
const SPACE_BEFORE_PUNCT = new RegExp(`[${SPACE_CHARS}]+([${PUNCT_CHARS}])`, 'g');
const REPEATED_SEPARATORS = new RegExp(`([،,؛:])(?:[${SPACE_CHARS}]*[،,؛:])+`, 'g');
const EDGE_PUNCT = new RegExp(`^[${SPACE_CHARS}${PUNCT_CHARS}]+|[${SPACE_CHARS}${PUNCT_CHARS}]+$`, 'g');

export interface VoiceTemplateValues {
  payerName?: string | null;
  amountToman: number;
  bankName?: string | null;
  cardNumber?: string | null;
}

/** قالب خالی یعنی پیش‌فرض؛ قالب بلندتر از سقف هم بریده می‌شود. */
export function normalizeVoiceTemplate(template?: string | null): string {
  const trimmed = migrateVoiceTemplate((template ?? '').trim());
  if (trimmed.length === 0) return DEFAULT_VOICE_TEMPLATE;
  if (trimmed.length > VOICE_TEMPLATE_MAX_LENGTH) {
    return trimmed.slice(0, VOICE_TEMPLATE_MAX_LENGTH).trim();
  }
  return trimmed;
}

/** قالب وقتی معتبر است که جای مبلغ را مشخص کرده باشد؛ وگرنه فقط یک جمله‌ی بی‌عدد گفته می‌شود. */
export function isValidVoiceTemplate(template?: string | null): boolean {
  const value = (template ?? '').trim();
  if (value.length === 0 || value.length > VOICE_TEMPLATE_MAX_LENGTH) return false;
  return (
    value.includes('{مبلغ}') ||
    value.includes('{مبلغ_رقمی}') ||
    value.includes('{amount}') ||
    value.includes('{amountNumber}')
  );
}

/** پیام خطای فارسی برای ویرایشگر؛ `null` یعنی قالب درست است. */
export function voiceTemplateError(template?: string | null): string | null {
  const value = (template ?? '').trim();
  if (value.length === 0) return 'جمله را بنویس؛ مثلاً «{نام}، {مبلغ} تومن برات واریز کرد».';
  if (value.length > VOICE_TEMPLATE_MAX_LENGTH) {
    return `جمله حداکثر ${toPersianDigits(VOICE_TEMPLATE_MAX_LENGTH)} نویسه باشد.`;
  }
  if (!isValidVoiceTemplate(value)) {
    return 'جمله باید {مبلغ} یا {مبلغ_رقمی} داشته باشد تا مبلغ گفته شود.';
  }
  return null;
}

/**
 * جمله‌ی نهایی برای گفتن.
 *
 * جای توکن‌ها پر می‌شود، بعد فاصله/نقطه‌گذاری‌های جامانده مرتب می‌شوند: اگر نام
 * واریزکننده در پیامک نبود، «،» اول جمله و فاصله‌های تکراری پاک می‌شوند تا
 * جمله‌ای مثل «، هفتاد تومن …» گفته نشود. اگر بعد از پاک‌سازی چیزی نماند، به
 * جمله‌ی استاندارد برمی‌گردیم تا هیچ واریزی بی‌صدا نماند.
 */
export function renderVoiceTemplate(
  template: string | null | undefined,
  values: VoiceTemplateValues,
): string {
  const source = normalizeVoiceTemplate(template);
  const name = (values.payerName ?? '').trim();
  const amount = formatColloquialSpeechAmount(values.amountToman);
  const amountNumber = formatAmount(values.amountToman);
  const bank = (values.bankName ?? '').trim();
  const card = lastFourDigits(values.cardNumber);

  const replacements: Record<string, string> = {
    نام: name,
    name,
    مبلغ: amount,
    amount,
    مبلغ_رقمی: amountNumber,
    amountNumber,
    بانک: bank,
    bank,
    کارت: card,
    card,
  };

  // یک‌جا جایگزین می‌شود تا متنی که خودش شبیه توکن است (مثلاً نامی با «{مبلغ}»)
  // دوباره تفسیر نشود.
  const rendered = source.replace(
    TOKEN_PATTERN,
    (match, token: string) => replacements[token] ?? match,
  );

  const cleaned = cleanVoiceSpeech(rendered);
  return cleaned.length > 0
    ? cleaned
    : buildColloquialDepositSpeech(values.amountToman, name.length > 0 ? name : null);
}

/** چهار رقم آخر کارت با ارقام فارسی؛ برای گفتن کافی است و کل شماره را لو نمی‌دهد. */
function lastFourDigits(cardNumber?: string | null): string {
  const digits = onlyDigits(cardNumber ?? '');
  return digits.length >= 4 ? toPersianDigits(digits.slice(-4)) : '';
}

/** مرتب‌کردن فاصله و نقطه‌گذاری جمله؛ عیناً همان `clean` در `SpeechTemplate.kt`. */
function cleanVoiceSpeech(text: string): string {
  return text
    .replace(SPACE_RUN, ' ')
    .replace(SPACE_BEFORE_PUNCT, '$1')
    .replace(REPEATED_SEPARATORS, '$1')
    .replace(EDGE_PUNCT, '')
    .replace(SPACE_RUN, ' ')
    .trim();
}
