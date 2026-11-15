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
 *  - `local` صدای عصبی فارسی روی خود گوشی (sherpa-onnx + Piper): جمله‌ی کامل
 *    در یک نفس، بدون اینترنت و بدون کلیپ تکه‌تکه
 *  - `edge` صدای عصبی آنلاین (پیش‌فرض): جمله‌ی کامل در یک نفس؛ اگر آفلاین باشی
 *    کلیپ‌های بسته‌بندی‌شده پخش می‌شوند
 *  - `offline` فقط کلیپ‌های بسته‌بندی‌شده (جمله‌ی ثابت «… تومن واریز شد»)
 *  - `system` موتور TTS خود گوشی
 *
 * مقدار قدیمی `avacore` (موتور حذف‌شده) در `parseVoiceAnnouncerService` به
 * `edge` تبدیل می‌شود تا تنظیمات ذخیره‌شده‌ی نسخه‌های قبل بی‌صدا نشوند.
 */
export type VoiceAnnouncerService = 'local' | 'neural' | 'clips' | 'system';

export const VOICE_ANNOUNCER_ENABLED_KEY = 'voice_announcer_enabled';
export const VOICE_ANNOUNCER_GENDER_KEY = 'voice_announcer_gender';
export const VOICE_ANNOUNCER_CHIME_KEY = 'voice_announcer_chime';
export const VOICE_ANNOUNCER_SERVICE_KEY = 'voice_announcer_service';
export const VOICE_ANNOUNCER_TEMPLATE_KEY = 'voice_announcer_template';
export const VOICE_ANNOUNCER_RATE_KEY = 'voice_announcer_rate';

/** کلیدهای تنظیمات اختصاصی موتور عصبی آفلاین (Sherpa-ONNX). */
export const SHERPA_VOICE_PITCH_KEY = 'sherpa_voice_pitch';
export const SHERPA_VOICE_GAIN_KEY = 'sherpa_voice_gain';
export const SHERPA_VOICE_SPEAKER_ID_KEY = 'sherpa_voice_speaker_id';
export const SHERPA_VOICE_THREADS_KEY = 'sherpa_voice_threads';

/** پیش‌فرض‌ها؛ مقدار ذخیره‌نشده یعنی همین‌ها. */
export const VOICE_ANNOUNCER_DEFAULT_ENABLED = 'true';
export const VOICE_ANNOUNCER_DEFAULT_GENDER: VoiceAnnouncerGender = 'female';
export const VOICE_ANNOUNCER_DEFAULT_CHIME = 'true';
export const VOICE_ANNOUNCER_DEFAULT_SERVICE: VoiceAnnouncerService = 'neural';
export const VOICE_ANNOUNCER_DEFAULT_RATE = 1;

/** پیش‌فرض‌های اختصاصی Sherpa-ONNX (۰ یعنی خودکار بر اساس جنسیت). */
export const DEFAULT_SHERPA_VOICE_PITCH = 0;
export const DEFAULT_SHERPA_VOICE_GAIN = 1.0;
export const DEFAULT_SHERPA_VOICE_SPEAKER_ID = -1;
export const DEFAULT_SHERPA_VOICE_THREADS = 2;

export interface SherpaVoiceSettings {
  /** زیروبمی صدا؛ ۰ یعنی خودکار بر اساس جنسیت، مقادیر ۰٫۷۰ تا ۱٫۳۵ تن را بم یا زیر می‌کنند. */
  pitch: number;
  /** تقویت بلندی صدا؛ ۱٫۰ یعنی عادی، ۱٫۲۵ و ۱٫۵ یعنی تقویت خروجی PCM. */
  gain: number;
  /** شناسه گوینده مدل؛ ۱- یعنی خودکار، اعداد بزرگتر از مساوی صفر برای انتخاب مستقیم. */
  speakerId: number;
  /** تعداد هسته‌های پردازشی CPU برای تولید صدا؛ بین ۱ تا ۴. */
  threads: number;
}

/** بازه‌ی سرعت گفتار؛ بیرون از این بازه جمله یا کشیده و خواب‌آور می‌شود یا ناخوانا. */
export const VOICE_ANNOUNCER_MIN_RATE = 0.6;
export const VOICE_ANNOUNCER_MAX_RATE = 1.4;

export const VOICE_ANNOUNCER_SERVICES: VoiceAnnouncerService[] = [
  'local',
  'neural',
  'clips',
  'system',
];

/** مقدار قدیمی ذخیره‌شده‌ی موتور حذف‌شده؛ فقط برای مهاجرت خوانده می‌شود. */
const LEGACY_AVACORE_SERVICE = 'avacore';

export const VOICE_ANNOUNCER_SERVICE_OPTIONS: {
  value: VoiceAnnouncerService;
  label: string;
  hint: string;
}[] = [
  {
    value: 'local',
    label: 'صدای عصبی روی گوشی',
    hint: 'فقط Sherpa-ONNX؛ جمله‌ی دلخواه کامل، بدون اینترنت',
  },
  {
    value: 'neural',
    label: 'صدای عصبی آنلاین',
    hint: 'فقط Dilara/Farid؛ در تست، خطای اتصال پنهان نمی‌شود',
  },
  {
    value: 'clips',
    label: 'کلیپ‌های آفلاین',
    hint: 'فقط مبلغ با فایل‌های زن/مرد از پیش ضبط‌شده',
  },
  {
    value: 'system',
    label: 'گوینده‌ی گوشی',
    hint: 'فقط موتور TTS اندروید؛ فارسی یا خوانش فینگلیش',
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

/** نمونه‌ی تست و پیش‌نمایش؛ یک واریز فرضی از «علی محمدی». */
export const VOICE_ANNOUNCER_TEST_PAYER = 'علی محمدی';
export const VOICE_ANNOUNCER_TEST_BANK = 'بلوبانک';
export const VOICE_ANNOUNCER_TEST_CARD = '6104337812345678';
/** نمونه‌ی واریز برای همه‌ی دکمه‌های تست؛ هر موتور دقیقاً همین جمله را می‌سازد. */
export const VOICE_ANNOUNCER_TEST_AMOUNT = 70_000;

export interface VoiceAnnouncerSettings {
  enabled: boolean;
  gender: VoiceAnnouncerGender;
  chime: boolean;
  service: VoiceAnnouncerService;
  /** قالب جمله با توکن‌های فارسی `{نام}` و `{مبلغ}` و … */
  template: string;
  /** سرعت گفتار؛ ۱ یعنی طبیعی. */
  rate: number;
  /** تنظیمات اختصاصی موتور آفلاین Sherpa-ONNX */
  sherpaPitch: number;
  sherpaGain: number;
  sherpaSpeakerId: number;
  sherpaThreads: number;
}

/** زیروبمی صدای Sherpa؛ ۰ یعنی خودکار، مقادیر معتبر بین ۰٫۷۰ تا ۱٫۳۵ */
export function parseSherpaVoicePitch(raw?: string | number | null): number {
  if (raw === null || raw === undefined || raw === '' || raw === 'auto' || raw === '۰') {
    return DEFAULT_SHERPA_VOICE_PITCH;
  }
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw).replace('٫', '.'));
  if (!Number.isFinite(value) || value <= 0.05) return DEFAULT_SHERPA_VOICE_PITCH;
  const clamped = Math.min(Math.max(value, 0.7), 1.35);
  return Math.round(clamped * 100) / 100;
}

/** تقویت خروجی صدای Sherpa؛ بین ۰٫۷۵ تا ۲٫۰ (پیش‌فرض ۱٫۰) */
export function parseSherpaVoiceGain(raw?: string | number | null): number {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_SHERPA_VOICE_GAIN;
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw).replace('٫', '.'));
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_SHERPA_VOICE_GAIN;
  const clamped = Math.min(Math.max(value, 0.75), 2.0);
  return Math.round(clamped * 100) / 100;
}

/** شناسه گوینده Sherpa؛ ۱- یعنی خودکار، اعداد مثبت یعنی گوینده خاص */
export function parseSherpaVoiceSpeakerId(raw?: string | number | null): number {
  if (raw === null || raw === undefined || raw === '' || raw === 'auto') {
    return DEFAULT_SHERPA_VOICE_SPEAKER_ID;
  }
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_SHERPA_VOICE_SPEAKER_ID;
  return Math.floor(value);
}

/** تعداد هسته‌های پردازشی Sherpa؛ ۱ تا ۴ (پیش‌فرض ۲) */
export function parseSherpaVoiceThreads(raw?: string | number | null): number {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_SHERPA_VOICE_THREADS;
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_SHERPA_VOICE_THREADS;
  return Math.min(Math.max(Math.floor(value), 1), 4);
}

/** سرعت را به بازه‌ی مجاز و دو رقم اعشار می‌آورد؛ مقدار خراب → پیش‌فرض. */
export function parseVoiceAnnouncerRate(raw?: string | number | null): number {
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '').replace('٫', '.'));
  if (!Number.isFinite(value)) return VOICE_ANNOUNCER_DEFAULT_RATE;
  const clamped = Math.min(Math.max(value, VOICE_ANNOUNCER_MIN_RATE), VOICE_ANNOUNCER_MAX_RATE);
  return Math.round(clamped * 100) / 100;
}

export function parseVoiceAnnouncerService(raw?: string | null): VoiceAnnouncerService {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === LEGACY_AVACORE_SERVICE || value === 'edge') return 'neural';
  if (value === 'offline') return 'clips';
  return VOICE_ANNOUNCER_SERVICES.includes(value as VoiceAnnouncerService)
    ? (value as VoiceAnnouncerService)
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
    sherpaPitch: parseSherpaVoicePitch(settings[SHERPA_VOICE_PITCH_KEY]),
    sherpaGain: parseSherpaVoiceGain(settings[SHERPA_VOICE_GAIN_KEY]),
    sherpaSpeakerId: parseSherpaVoiceSpeakerId(settings[SHERPA_VOICE_SPEAKER_ID_KEY]),
    sherpaThreads: parseSherpaVoiceThreads(settings[SHERPA_VOICE_THREADS_KEY]),
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
 * `amountToman` عمداً پارامتر است تا دکمه‌ی دوم تنظیمات بتواند یک مبلغ بالای
 * ۱۰۰ هزار تومان را هم آزمایش کند (مسیر گفتار «صد و پنجاه/دویست و پنجاه»).
 *
 * کلیدهای این شیء **قرارداد** با `testVoiceAnnouncement` در
 * `plugins/android/sms/SmsReaderModule.kt` هستند و با تایپ
 * `VoiceAnnouncementTestOptions` یکی‌اند؛ تست `voiceAnnouncer.test.ts` نگهبانش است.
 */
export function buildVoiceAnnouncementTestOptions(
  settings: VoiceAnnouncerSettings,
  amountToman: number = VOICE_ANNOUNCER_TEST_AMOUNT,
  service: VoiceAnnouncerService = settings.service,
): VoiceAnnouncementTestOptions {
  return {
    template: settings.template,
    engine: service,
    gender: settings.gender,
    chimeEnabled: settings.chime,
    rate: settings.rate,
    amountToman,
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
    sherpaPitch: settings.sherpaPitch,
    sherpaGain: settings.sherpaGain,
    sherpaSpeakerId: settings.sherpaSpeakerId,
    sherpaThreads: settings.sherpaThreads,
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
