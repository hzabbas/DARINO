import { formatAmount } from './currency';
import { onlyDigits, toPersianDigits } from './digits';
import { buildColloquialDepositSpeech, formatColloquialSpeechAmount } from './numberToWords';

/**
 * Voice deposit speech template processor.
 * Matches SpeechTemplate.kt in Android plugin.
 */

/** Primary tokens used by UI template chips. */
export const VOICE_TEMPLATE_TOKENS = ['نام', 'مبلغ', 'مبلغ_رقمی', 'بانک', 'کارت'] as const;

export type VoiceTemplateToken = (typeof VOICE_TEMPLATE_TOKENS)[number];

/** Persian labels for template chips. */
export const VOICE_TEMPLATE_TOKEN_LABELS: Record<VoiceTemplateToken, string> = {
  نام: 'نام واریزکننده',
  مبلغ: 'مبلغ با حروف',
  مبلغ_رقمی: 'مبلغ با رقم',
  بانک: 'نام بانک',
  کارت: '۴ رقم آخر کارت',
};

export const DEFAULT_VOICE_TEMPLATE = '{نام}، {مبلغ} تومن برات واریز کرد';

/** Max template length. */
export const VOICE_TEMPLATE_MAX_LENGTH = 160;

/** Preset announcement templates. */
export const VOICE_TEMPLATE_PRESETS: { label: string; template: string }[] = [
  { label: 'برات واریز کرد', template: DEFAULT_VOICE_TEMPLATE },
  { label: 'واریز کرد برات', template: '{نام}، {مبلغ} تومن واریز کرد برات' },
  { label: 'زد به کارتت', template: '{نام}، {مبلغ} تومن زد به کارتت' },
  { label: 'مبلغ و بانک', template: '{نام} {مبلغ} تومن به {بانک} واریز کرد' },
];

/** Legacy Latin token migration map. */
const LEGACY_TOKEN_MAP: Record<string, string> = {
  name: 'نام',
  amount: 'مبلغ',
  amountNumber: 'مبلغ_رقمی',
  bank: 'بانک',
  card: 'کارت',
};

const LEGACY_TOKEN_PATTERN = /\{(name|amountNumber|amount|bank|card)\}/g;

/** Migrate legacy template tokens to Persian. */
export function migrateVoiceTemplate(template: string): string {
  return template.replace(LEGACY_TOKEN_PATTERN, (_match, token: string) => {
    return `{${LEGACY_TOKEN_MAP[token] ?? token}}`;
  });
}

/** Whitespace characters regex class (excluding ZWNJ). */
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

/** Normalize voice template with fallback to default. */
export function normalizeVoiceTemplate(template?: string | null): string {
  const trimmed = migrateVoiceTemplate((template ?? '').trim());
  if (trimmed.length === 0) return DEFAULT_VOICE_TEMPLATE;
  if (trimmed.length > VOICE_TEMPLATE_MAX_LENGTH) {
    return trimmed.slice(0, VOICE_TEMPLATE_MAX_LENGTH).trim();
  }
  return trimmed;
}

/** Check if template is valid and non-empty. */
export function isValidVoiceTemplate(template?: string | null): boolean {
  const value = (template ?? '').trim();
  return value.length > 0 && value.length <= VOICE_TEMPLATE_MAX_LENGTH;
}

/** Error message for template editor or null if valid. */
export function voiceTemplateError(template?: string | null): string | null {
  const value = (template ?? '').trim();
  if (value.length === 0) return 'جمله را بنویس؛ مثلاً «{نام}، {مبلغ} تومن برات واریز کرد».';
  if (value.length > VOICE_TEMPLATE_MAX_LENGTH) {
    return `جمله حداکثر ${toPersianDigits(VOICE_TEMPLATE_MAX_LENGTH)} نویسه باشد.`;
  }
  return null;
}

/**
 * Render voice template with provided values.
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

  // Replace tokens in one pass.
  const rendered = source.replace(
    TOKEN_PATTERN,
    (match, token: string) => replacements[token] ?? match,
  );

  // Preserve plain text without tokens.
  TOKEN_PATTERN.lastIndex = 0;
  if (!TOKEN_PATTERN.test(source)) return source;
  TOKEN_PATTERN.lastIndex = 0;
  const cleaned = cleanVoiceSpeech(rendered);
  return cleaned.length > 0
    ? cleaned
    : buildColloquialDepositSpeech(values.amountToman, name.length > 0 ? name : null);
}

/** Extract last 4 digits of card in Persian digits. */
function lastFourDigits(cardNumber?: string | null): string {
  const digits = onlyDigits(cardNumber ?? '');
  return digits.length >= 4 ? toPersianDigits(digits.slice(-4)) : '';
}

/** Clean punctuation and spaces (matches clean in SpeechTemplate.kt). */
function cleanVoiceSpeech(text: string): string {
  return text
    .replace(SPACE_RUN, ' ')
    .replace(SPACE_BEFORE_PUNCT, '$1')
    .replace(REPEATED_SEPARATORS, '$1')
    .replace(EDGE_PUNCT, '')
    .replace(SPACE_RUN, ' ')
    .trim();
}
