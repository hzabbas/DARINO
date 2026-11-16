/**
 * Bidirectional text utilities (BiDi).
 * Isolates LTR tokens (phone numbers, card digits, IBAN) in RTL context.
 */
export const LTR_ISOLATE_START = '\u2066';
export const LTR_ISOLATE_END = '\u2069';

/**
 * Invisible characters (directional marks, zero-width spaces).
 */
const INVISIBLE_PATTERN = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u00ad\u00a0\ufeff]/g;

const RTL_STRONG_PATTERN = /[\u0590-\u05ff\u0600-\u06ff\u0700-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
const LTR_STRONG_PATTERN = /[A-Za-z0-9+\-()./]/;

/** Wrap token with LTR isolate chars. */
export function isolateLtr(input: string | number | null | undefined): string {
  const value = String(input ?? '').trim();
  if (!value) return '';
  if (value.includes(LTR_ISOLATE_START)) return value;
  return `${LTR_ISOLATE_START}${value}${LTR_ISOLATE_END}`;
}

/** Strip directional marks and invisible spaces. */
export function stripDirectionalMarks(input: string | null | undefined): string {
  return String(input ?? '').replace(INVISIBLE_PATTERN, '');
}

/** Join LTR tokens with separator preserving individual isolation. */
export function joinLtrTokens(tokens: readonly string[], separator = '، '): string {
  return tokens
    .map((token) => stripDirectionalMarks(token).trim())
    .filter(Boolean)
    .map((token) => isolateLtr(token))
    .join(separator);
}

/**
 * Detect text direction from content or fallback placeholder.
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

/** Check if token contains only Latin characters and numbers. */
export function isLatinToken(input: string | null | undefined): boolean {
  const value = stripDirectionalMarks(input).trim();
  return value.length > 0 && !RTL_STRONG_PATTERN.test(value) && LTR_STRONG_PATTERN.test(value);
}
