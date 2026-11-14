import { listBankAccounts } from '../db/bankAccounts';
import { getAllSettings } from '../db/settings';
import type { VoiceAnnouncementTestOptions } from '../native/smsReader';
import type { SqlDatabase } from '../types/models';
import { getBank } from '../utils/iranianBanks';
import {
  DEFAULT_VOICE_TEMPLATE,
  isValidVoiceTemplate,
  normalizeVoiceTemplate,
  renderVoiceTemplate,
} from '../utils/voiceTemplate';

/**
 * اعلام صوتی واریز وجه (حالت رانندگی) — مدل تنظیمات.
 *
 * این فایل عمداً هیچ وابستگی‌ای به ماژول بومی ندارد تا با `node:test` قابل تست
 * بماند؛ پخش و همگام‌سازی بومی در `voiceAnnouncerAudio.ts` است.
 *
 * تنظیمات اینجا نگه‌داری می‌شوند و مقدارشان به SharedPreferences بومی هم فرستاده
 * می‌شود؛ چون اعلام باید حتی وقتی دارینو بسته است و صفحه خاموش است کار کند.
 */

export type VoiceAnnouncerGender = 'female' | 'male';

/**
 * سرویس صوتی که جمله با آن گفته می‌شود.
 *
 *  - `avacore` موتور آفلاین آواکور (پیش‌فرض): جمله‌ی کامل با قالب کاربر، بدون اینترنت
 *  - `edge` صدای عصبی آنلاین؛ اگر آفلاین باشی کلیپ‌های بسته‌بندی‌شده پخش می‌شوند
 *  - `offline` فقط کلیپ‌های بسته‌بندی‌شده (جمله‌ی ثابت «… تومن واریز شد»)
 *  - `system` موتور TTS خود گوشی
 */
export type VoiceAnnouncerService = 'avacore' | 'edge' | 'offline' | 'system';

export const VOICE_ANNOUNCER_ENABLED_KEY = 'voice_announcer_enabled';
export const VOICE_ANNOUNCER_GENDER_KEY = 'voice_announcer_gender';
export const VOICE_ANNOUNCER_CHIME_KEY = 'voice_announcer_chime';
export const VOICE_ANNOUNCER_SERVICE_KEY = 'voice_announcer_service';
export const VOICE_ANNOUNCER_TEMPLATE_KEY = 'voice_announcer_template';
export const VOICE_ANNOUNCER_RATE_KEY = 'voice_announcer_rate';

/** پیش‌فرض‌ها؛ مقدار ذخیره‌نشده یعنی همین‌ها. */
export const VOICE_ANNOUNCER_DEFAULT_ENABLED = 'true';
export const VOICE_ANNOUNCER_DEFAULT_GENDER: VoiceAnnouncerGender = 'female';
export const VOICE_ANNOUNCER_DEFAULT_CHIME = 'true';
export const VOICE_ANNOUNCER_DEFAULT_SERVICE: VoiceAnnouncerService = 'avacore';
export const VOICE_ANNOUNCER_DEFAULT_RATE = 1;

/** بازه‌ی سرعت گفتار؛ بیرون از این بازه جمله یا کشیده و خواب‌آور می‌شود یا ناخوانا. */
export const VOICE_ANNOUNCER_MIN_RATE = 0.6;
export const VOICE_ANNOUNCER_MAX_RATE = 1.4;

export const VOICE_ANNOUNCER_SERVICES: VoiceAnnouncerService[] = [
  'avacore',
  'edge',
  'offline',
  'system',
];

export const VOICE_ANNOUNCER_SERVICE_OPTIONS: {
  value: VoiceAnnouncerService;
  label: string;
  hint: string;
}[] = [
  {
    value: 'avacore',
    label: 'آواکور (آفلاین)',
    hint: 'جمله‌ی کامل با قالب خودت، روی گوشی و بدون اینترنت',
  },
  {
    value: 'edge',
    label: 'صدای عصبی آنلاین',
    hint: 'طبیعی‌ترین صدا؛ به اینترنت نیاز دارد و اگر نباشد آفلاین پخش می‌شود',
  },
  {
    value: 'offline',
    label: 'کلیپ‌های آفلاین',
    hint: 'بدون اینترنت، ولی فقط مبلغ گفته می‌شود: «… تومن واریز شد»',
  },
  {
    value: 'system',
    label: 'گوینده‌ی گوشی',
    hint: 'همان موتور TTS پیش‌فرض اندروید؛ بستگی به گوشی دارد',
  },
];

/** سرعت‌های آماده با برچسب فارسی؛ مقدارها با `parseVoiceAnnouncerRate` گرد می‌شوند. */
export const VOICE_ANNOUNCER_RATE_OPTIONS: { value: number; label: string }[] = [
  { value: 0.8, label: 'آرام‌تر' },
  { value: 0.9, label: 'آرام' },
  { value: 1, label: 'معمولی' },
  { value: 1.1, label: 'تند' },
  { value: 1.25, label: 'تندتر' },
];

/** صفحه‌ی انتشار آواکور؛ نصب دستی موتور صوتی (اپ مستقل با مجوز GPL-3.0). */
export const AVACORE_RELEASES_URL = 'https://github.com/PlayFoundryHQ/AvaCore/releases/latest';
export const AVACORE_APK_URL =
  'https://github.com/PlayFoundryHQ/AvaCore/releases/latest/download/avacore-latest.apk';

/** نمونه‌ی تست و پیش‌نمایش؛ یک واریز فرضی از «علی محمدی». */
export const VOICE_ANNOUNCER_TEST_PAYER = 'علی محمدی';
export const VOICE_ANNOUNCER_TEST_BANK = 'بلوبانک';
export const VOICE_ANNOUNCER_TEST_CARD = '6104337812345678';
export const VOICE_ANNOUNCER_TEST_AMOUNT = 70_000;

export interface VoiceAnnouncerSettings {
  enabled: boolean;
  gender: VoiceAnnouncerGender;
  chime: boolean;
  service: VoiceAnnouncerService;
  /** قالب جمله با توکن‌های `{name}` و `{amount}` و … */
  template: string;
  /** سرعت گفتار؛ ۱ یعنی طبیعی. */
  rate: number;
}

/** سرعت را به بازه‌ی مجاز و دو رقم اعشار می‌آورد؛ مقدار خراب → پیش‌فرض. */
export function parseVoiceAnnouncerRate(raw?: string | number | null): number {
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '').replace('٫', '.'));
  if (!Number.isFinite(value)) return VOICE_ANNOUNCER_DEFAULT_RATE;
  const clamped = Math.min(Math.max(value, VOICE_ANNOUNCER_MIN_RATE), VOICE_ANNOUNCER_MAX_RATE);
  return Math.round(clamped * 100) / 100;
}

export function parseVoiceAnnouncerService(raw?: string | null): VoiceAnnouncerService {
  return VOICE_ANNOUNCER_SERVICES.includes(raw as VoiceAnnouncerService)
    ? (raw as VoiceAnnouncerService)
    : VOICE_ANNOUNCER_DEFAULT_SERVICE;
}

/** تبدیل کلید/مقدارهای ذخیره‌شده به تنظیمات معتبر (مقدار خراب → پیش‌فرض). */
export function parseVoiceAnnouncerSettings(
  settings: Record<string, string>,
): VoiceAnnouncerSettings {
  const gender: VoiceAnnouncerGender =
    settings[VOICE_ANNOUNCER_GENDER_KEY] === 'male' ? 'male' : 'female';

  const storedTemplate = settings[VOICE_ANNOUNCER_TEMPLATE_KEY];
  const template =
    storedTemplate && isValidVoiceTemplate(storedTemplate)
      ? normalizeVoiceTemplate(storedTemplate)
      : DEFAULT_VOICE_TEMPLATE;

  return {
    enabled: (settings[VOICE_ANNOUNCER_ENABLED_KEY] ?? VOICE_ANNOUNCER_DEFAULT_ENABLED) === 'true',
    gender,
    chime: (settings[VOICE_ANNOUNCER_CHIME_KEY] ?? VOICE_ANNOUNCER_DEFAULT_CHIME) === 'true',
    service: parseVoiceAnnouncerService(settings[VOICE_ANNOUNCER_SERVICE_KEY]),
    template,
    rate: parseVoiceAnnouncerRate(settings[VOICE_ANNOUNCER_RATE_KEY]),
  };
}

export function readVoiceAnnouncerSettings(db: SqlDatabase): VoiceAnnouncerSettings {
  return parseVoiceAnnouncerSettings(getAllSettings(db));
}

/** جمله‌ای که با این قالب و واریز نمونه گفته می‌شود؛ همان متن پیش‌نمایش تنظیمات. */
export function previewVoiceAnnouncerSpeech(
  settings: Pick<VoiceAnnouncerSettings, 'template'>,
): string {
  return renderVoiceTemplate(settings.template, {
    payerName: VOICE_ANNOUNCER_TEST_PAYER,
    amountToman: VOICE_ANNOUNCER_TEST_AMOUNT,
    bankName: VOICE_ANNOUNCER_TEST_BANK,
    cardNumber: VOICE_ANNOUNCER_TEST_CARD,
  });
}

/**
 * گزینه‌های پخش جمله‌ی نمونه؛ همان شیئی که به لایه‌ی بومی می‌رود.
 *
 * کلیدهای این شیء **قرارداد** با `testVoiceAnnouncement` در
 * `plugins/android/sms/SmsReaderModule.kt` هستند و با تایپ
 * `VoiceAnnouncementTestOptions` یکی‌اند؛ تست `voiceAnnouncer.test.ts` نگهبانش است.
 */
export function buildVoiceAnnouncementTestOptions(
  settings: VoiceAnnouncerSettings,
): VoiceAnnouncementTestOptions {
  return {
    template: settings.template,
    service: settings.service,
    gender: settings.gender,
    playChime: settings.chime,
    rate: settings.rate,
    amountToman: VOICE_ANNOUNCER_TEST_AMOUNT,
    payerName: VOICE_ANNOUNCER_TEST_PAYER,
    bankName: VOICE_ANNOUNCER_TEST_BANK,
    cardNumber: VOICE_ANNOUNCER_TEST_CARD,
  };
}

export interface VoiceAnnouncerAccount {
  id: number;
  bankKey: string;
  bankName: string;
  cardNumber: string;
  accountNumber: string;
  senders: string[];
  announceVoice: boolean;
}

/**
 * JSON کاملی که گیرنده‌ی بومی برای اعلام صوتی لازم دارد.
 *
 * حساب‌هایی که اعلام صوتی‌شان خاموش است هم فرستاده می‌شوند تا اگر بعداً روشن شد
 * نیازی به همگام‌سازی دوباره نباشد؛ خود گیرنده فقط `announceVoice` را می‌خواند.
 * سرشماره‌ها هم می‌آیند تا گیرنده‌ی بومی مستقل از باز بودن اپ بداند کدام پیامک
 * «بانکی» است.
 */
export function buildVoiceConfigJson(db: SqlDatabase): string {
  const settings = readVoiceAnnouncerSettings(db);
  const accounts = listBankAccounts(db);

  const payload = {
    enabled: settings.enabled,
    gender: settings.gender,
    chime: settings.chime,
    service: settings.service,
    template: settings.template,
    rate: settings.rate,
    senders: Array.from(new Set(accounts.flatMap((account) => account.senders))),
    accounts: accounts.map((account): VoiceAnnouncerAccount => ({
      id: account.id,
      bankKey: account.bank_code,
      bankName: getBank(account.bank_code).name,
      // در مدل فعلی `account_number` همان شماره کارت/حساب واردشده در فرم است.
      cardNumber: account.account_number ?? '',
      accountNumber: account.account_number ?? '',
      senders: account.senders,
      announceVoice: account.announceVoice,
    })),
  };

  return JSON.stringify(payload);
}
