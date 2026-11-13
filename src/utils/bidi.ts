/**
 * ابزارهای دوجهته (BiDi).
 *
 * در یک پاراگراف راست‌به‌چپ، کاراکترهای خنثی مثل «+» به انتهای عدد می‌پرند و
 * «+989999987641» به شکل «989999987641+» دیده می‌شود. راه مطمئن این است که هر
 * توکن لاتین (شماره کارت، شماره موبایل، سرشماره) را داخل جداکننده‌ی چپ‌به‌راست
 * (U+2066 … U+2069) بگذاریم تا مستقل از جهت پاراگراف، درست رندر شود.
 */
export const LTR_ISOLATE_START = '\u2066';
export const LTR_ISOLATE_END = '\u2069';

/**
 * کاراکترهای نامرئی (نشانگرهای جهت، نیم‌فاصله، فاصله‌ی بدون‌شکست، نرم‌خط)
 * که نه در نمایش و نه در مقایسه‌ی سرشماره‌ها نباید مشکلی بسازند.
 */
const INVISIBLE_PATTERN = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u00ad\u00a0\ufeff]/g;

const RTL_STRONG_PATTERN = /[\u0590-\u05ff\u0600-\u06ff\u0700-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
const LTR_STRONG_PATTERN = /[A-Za-z0-9+\-()./]/;

/** توکن لاتین/عددی را داخل جداکننده‌ی LTR می‌گذارد تا وارونه دیده نشود. */
export function isolateLtr(input: string | number | null | undefined): string {
  const value = String(input ?? '').trim();
  if (!value) return '';
  if (value.includes(LTR_ISOLATE_START)) return value;
  return `${LTR_ISOLATE_START}${value}${LTR_ISOLATE_END}`;
}

/** نشانگرهای جهت و فاصله‌های نامرئی را پاک می‌کند (برای مقایسه و ذخیره‌ی یکدست). */
export function stripDirectionalMarks(input: string | null | undefined): string {
  return String(input ?? '').replace(INVISIBLE_PATTERN, '');
}

/** فهرست توکن‌های لاتین را با نگه‌داشتن جهت درست هر کدام به هم می‌چسباند. */
export function joinLtrTokens(tokens: readonly string[], separator = '، '): string {
  return tokens
    .map((token) => stripDirectionalMarks(token).trim())
    .filter(Boolean)
    .map((token) => isolateLtr(token))
    .join(separator);
}

/**
 * جهت ورودی‌های متنی را از محتوایشان می‌فهمد.
 *
 * ورودی خالی جهت پیش‌فرض را از placeholder می‌گیرد؛ بنابراین مقصد «شماره کارت»
 * (placeholder لاتین) چپ‌به‌راست و مقصد «نام حساب» راست‌به‌چپ می‌شود. همین کار
 * باعث می‌شود مکان‌نمای ورودی خالی روی حرف اول placeholder نیفتد.
 */
export function directionForInput(
  value: string | null | undefined,
  placeholder = '',
): 'ltr' | 'rtl' {
  const raw = stripDirectionalMarks(value).trim() || stripDirectionalMarks(placeholder).trim();
  if (!raw) return 'rtl';

  const firstStrong = raw.replace(/^[\s\u200e\u200f]+/, '')[0] ?? '';
  if (RTL_STRONG_PATTERN.test(firstStrong)) return 'rtl';
  if (LTR_STRONG_PATTERN.test(firstStrong)) return 'ltr';
  return 'rtl';
}

/** آیا متن فقط از ارقام/نشانه‌های لاتین ساخته شده؟ (شماره کارت، مبلغ لاتین) */
export function isLatinToken(input: string | null | undefined): boolean {
  const value = stripDirectionalMarks(input).trim();
  return value.length > 0 && !RTL_STRONG_PATTERN.test(value) && LTR_STRONG_PATTERN.test(value);
}
