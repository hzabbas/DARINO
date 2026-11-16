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
 * Voice Announcer Settings Model.
 * Kept free of native imports for testability under node:test.
 */

export type VoiceAnnouncerGender = 'female' | 'male';

/**
 * Speech synthesis engines:
 *  - `local`: On-device neural voice (sherpa-onnx + Piper)
 *  - `neural`: Online neural voice (Microsoft Edge TTS)
 *  - `clips`: Packaged offline audio clips
 *  - `system`: Android system TextToSpeech
 */
export type VoiceAnnouncerService = 'local' | 'neural' | 'clips' | 'system';

export const VOICE_ANNOUNCER_ENABLED_KEY = 'voice_announcer_enabled';
export const VOICE_ANNOUNCER_GENDER_KEY = 'voice_announcer_gender';
export const VOICE_ANNOUNCER_CHIME_KEY = 'voice_announcer_chime';
export const VOICE_ANNOUNCER_SERVICE_KEY = 'voice_announcer_service';
export const VOICE_ANNOUNCER_TEMPLATE_KEY = 'voice_announcer_template';
export const VOICE_ANNOUNCER_RATE_KEY = 'voice_announcer_rate';
export const VOICE_ANNOUNCER_PITCH_KEY = 'voice_announcer_pitch';
export const VOICE_ANNOUNCER_GAIN_KEY = 'voice_announcer_gain';

/** Keys for Sherpa-ONNX engine configuration. */
export const SHERPA_VOICE_PITCH_KEY = 'sherpa_voice_pitch';
export const SHERPA_VOICE_GAIN_KEY = 'sherpa_voice_gain';
export const SHERPA_VOICE_SPEAKER_ID_KEY = 'sherpa_voice_speaker_id';
export const SHERPA_VOICE_THREADS_KEY = 'sherpa_voice_threads';

/** Default values */
export const VOICE_ANNOUNCER_DEFAULT_ENABLED = 'true';
export const VOICE_ANNOUNCER_DEFAULT_GENDER: VoiceAnnouncerGender = 'female';
export const VOICE_ANNOUNCER_DEFAULT_CHIME = 'true';
export const VOICE_ANNOUNCER_DEFAULT_SERVICE: VoiceAnnouncerService = 'neural';
export const VOICE_ANNOUNCER_DEFAULT_RATE = 1;
export const VOICE_ANNOUNCER_DEFAULT_PITCH = 0;
export const VOICE_ANNOUNCER_DEFAULT_GAIN = 1.0;

export const DEFAULT_SHERPA_VOICE_PITCH = 0;
export const DEFAULT_SHERPA_VOICE_GAIN = 1.0;
export const DEFAULT_SHERPA_VOICE_SPEAKER_ID = -1;
export const DEFAULT_SHERPA_VOICE_THREADS = 2;

export interface SherpaVoiceSettings {
  pitch: number;
  gain: number;
  speakerId: number;
  threads: number;
}

export const VOICE_ANNOUNCER_MIN_RATE = 0.6;
export const VOICE_ANNOUNCER_MAX_RATE = 1.4;

export const VOICE_ANNOUNCER_SERVICES: VoiceAnnouncerService[] = [
  'local',
  'neural',
  'clips',
  'system',
];

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

export const VOICE_ANNOUNCER_RATE_OPTIONS: { value: number; label: string }[] = [
  { value: 0.8, label: 'آرام‌تر' },
  { value: 0.9, label: 'آرام' },
  { value: 1, label: 'معمولی' },
  { value: 1.1, label: 'تند' },
  { value: 1.25, label: 'تندتر' },
];

export const VOICE_PITCH_PRESETS: { key: string; label: string; value: number; hint: string }[] = [
  { key: 'auto', label: 'خودکار', value: 0, hint: 'تنظیم بر اساس گوینده' },
  { key: 'bass', label: 'بم', value: 0.85, hint: 'صدای عمیق و بم' },
  { key: 'normal', label: 'طبیعی', value: 1.0, hint: 'تن استاندارد بدون تغییر' },
  { key: 'treble', label: 'زیر', value: 1.2, hint: 'صدای رسا و زیر' },
];

export const VOICE_GAIN_PRESETS: { key: string; label: string; value: number; hint: string }[] = [
  { key: 'normal', label: '۱۰۰٪ عادی', value: 1.0, hint: 'بلندی استاندارد' },
  { key: 'loud', label: '۱۲۵٪ رسا', value: 1.25, hint: 'مناسب محیط‌های نیمه‌شلوغ' },
  { key: 'boost', label: '۱۵۰٪ بلند', value: 1.5, hint: 'مناسب رانندگی در خودرو' },
];

export const VOICE_ANNOUNCER_TEST_PAYER = 'علی محمدی';
export const VOICE_ANNOUNCER_TEST_BANK = 'بلوبانک';
export const VOICE_ANNOUNCER_TEST_CARD = '6104337812345678';
export const VOICE_ANNOUNCER_TEST_AMOUNT = 70_000;

export interface VoiceAnnouncerSettings {
  enabled: boolean;
  gender: VoiceAnnouncerGender;
  chime: boolean;
  service: VoiceAnnouncerService;
  template: string;
  rate: number;
  pitch: number;
  gain: number;
  sherpaPitch: number;
  sherpaGain: number;
  sherpaSpeakerId: number;
  sherpaThreads: number;
}

/** Parses pitch multiplier (0 = auto, 0.70 to 1.35). */
export function parseSherpaVoicePitch(raw?: string | number | null): number {
  if (raw === null || raw === undefined || raw === '' || raw === 'auto' || raw === '۰') {
    return DEFAULT_SHERPA_VOICE_PITCH;
  }
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw).replace('٫', '.'));
  if (!Number.isFinite(value) || value <= 0.05) return DEFAULT_SHERPA_VOICE_PITCH;
  const clamped = Math.min(Math.max(value, 0.7), 1.35);
  return Math.round(clamped * 100) / 100;
}

export function parseVoiceAnnouncerPitch(raw?: string | number | null): number {
  return parseSherpaVoicePitch(raw);
}

/** Parses audio output gain (0.75 to 2.0). */
export function parseSherpaVoiceGain(raw?: string | number | null): number {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_SHERPA_VOICE_GAIN;
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw).replace('٫', '.'));
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_SHERPA_VOICE_GAIN;
  const clamped = Math.min(Math.max(value, 0.75), 2.0);
  return Math.round(clamped * 100) / 100;
}

export function parseVoiceAnnouncerGain(raw?: string | number | null): number {
  return parseSherpaVoiceGain(raw);
}

/** Parses Sherpa speaker ID (-1 = auto). */
export function parseSherpaVoiceSpeakerId(raw?: string | number | null): number {
  if (raw === null || raw === undefined || raw === '' || raw === 'auto') {
    return DEFAULT_SHERPA_VOICE_SPEAKER_ID;
  }
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_SHERPA_VOICE_SPEAKER_ID;
  return Math.floor(value);
}

/** Parses CPU threads (1 to 4, default 2). */
export function parseSherpaVoiceThreads(raw?: string | number | null): number {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_SHERPA_VOICE_THREADS;
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_SHERPA_VOICE_THREADS;
  return Math.min(Math.max(Math.floor(value), 1), 4);
}

/** Parses speech rate (clamped between 0.6 and 1.4). */
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

/** Converts raw key-value settings to typed configuration. */
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

  const pitch = parseVoiceAnnouncerPitch(
    settings[VOICE_ANNOUNCER_PITCH_KEY] ?? settings[SHERPA_VOICE_PITCH_KEY],
  );
  const gain = parseVoiceAnnouncerGain(
    settings[VOICE_ANNOUNCER_GAIN_KEY] ?? settings[SHERPA_VOICE_GAIN_KEY],
  );

  return {
    enabled: (settings[VOICE_ANNOUNCER_ENABLED_KEY] ?? VOICE_ANNOUNCER_DEFAULT_ENABLED) === 'true',
    gender,
    chime: (settings[VOICE_ANNOUNCER_CHIME_KEY] ?? VOICE_ANNOUNCER_DEFAULT_CHIME) === 'true',
    service: parseVoiceAnnouncerService(settings[VOICE_ANNOUNCER_SERVICE_KEY]),
    template,
    rate: parseVoiceAnnouncerRate(settings[VOICE_ANNOUNCER_RATE_KEY]),
    pitch,
    gain,
    sherpaPitch: pitch,
    sherpaGain: gain,
    sherpaSpeakerId: parseSherpaVoiceSpeakerId(settings[SHERPA_VOICE_SPEAKER_ID_KEY]),
    sherpaThreads: parseSherpaVoiceThreads(settings[SHERPA_VOICE_THREADS_KEY]),
  };
}

export function readVoiceAnnouncerSettings(db: SqlDatabase): VoiceAnnouncerSettings {
  return parseVoiceAnnouncerSettings(getAllSettings(db));
}

/** Previews speech with sample deposit data. */
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

/** Native test options contract matching SmsReaderModule bridge. */
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

/** Full JSON payload synced to SharedPreferences for background receivers. */
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
    pitch: settings.pitch,
    gain: settings.gain,
    sherpaPitch: settings.sherpaPitch,
    sherpaGain: settings.sherpaGain,
    sherpaSpeakerId: settings.sherpaSpeakerId,
    sherpaThreads: settings.sherpaThreads,
    senders: Array.from(new Set(accounts.flatMap((account) => account.senders))),
    accounts: accounts.map((account): VoiceAnnouncerAccount => ({
      id: account.id,
      bankKey: account.bank_code,
      bankName: getBank(account.bank_code).name,
      cardNumber: account.account_number ?? '',
      accountNumber: account.account_number ?? '',
      senders: account.senders,
      announceVoice: account.announceVoice,
    })),
  };

  return JSON.stringify(payload);
}
