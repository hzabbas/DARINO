import { listBankAccounts } from '../db/bankAccounts';
import { getAllSettings } from '../db/settings';
import {
  isSmsReaderAvailable,
  testVoiceAnnouncement,
  syncVoiceConfig,
} from '../native/smsReader';
import type { SqlDatabase } from '../types/models';
import { getBank } from '../utils/iranianBanks';
import { buildColloquialDepositSpeech } from '../utils/numberToWords';

/**
 * اعلام صوتی واریز وجه (حالت رانندگی).
 *
 * تنظیمات اینجا نگه‌داری می‌شوند و مقدارشان به SharedPreferences بومی هم فرستاده
 * می‌شود؛ چون اعلام باید حتی وقتی دارینو بسته است و صفحه خاموش است کار کند.
 */

export type VoiceAnnouncerGender = 'female' | 'male';

export const VOICE_ANNOUNCER_ENABLED_KEY = 'voice_announcer_enabled';
export const VOICE_ANNOUNCER_GENDER_KEY = 'voice_announcer_gender';
export const VOICE_ANNOUNCER_CHIME_KEY = 'voice_announcer_chime';

/** پیش‌فرض‌ها؛ مقدار ذخیره‌نشده یعنی همین‌ها. */
export const VOICE_ANNOUNCER_DEFAULT_ENABLED = 'true';
export const VOICE_ANNOUNCER_DEFAULT_GENDER: VoiceAnnouncerGender = 'female';
export const VOICE_ANNOUNCER_DEFAULT_CHIME = 'true';

export interface VoiceAnnouncerSettings {
  enabled: boolean;
  gender: VoiceAnnouncerGender;
  chime: boolean;
}

/** جمله‌ی تستی؛ دقیقاً همان چیزی که در تنظیمات پخش می‌شود. */
export const VOICE_ANNOUNCER_TEST_TEXT = buildColloquialDepositSpeech(70000, 'علی محمدی');

export const VOICE_ANNOUNCER_TEST_PAYER = 'علی محمدی';

/** تبدیل کلید/مقدارهای ذخیره‌شده به تنظیمات معتبر (مقدار خراب → پیش‌فرض). */
export function parseVoiceAnnouncerSettings(
  settings: Record<string, string>,
): VoiceAnnouncerSettings {
  const gender: VoiceAnnouncerGender =
    settings[VOICE_ANNOUNCER_GENDER_KEY] === 'male' ? 'male' : 'female';

  return {
    enabled: (settings[VOICE_ANNOUNCER_ENABLED_KEY] ?? VOICE_ANNOUNCER_DEFAULT_ENABLED) === 'true',
    gender,
    chime: (settings[VOICE_ANNOUNCER_CHIME_KEY] ?? VOICE_ANNOUNCER_DEFAULT_CHIME) === 'true',
  };
}

export function readVoiceAnnouncerSettings(db: SqlDatabase): VoiceAnnouncerSettings {
  return parseVoiceAnnouncerSettings(getAllSettings(db));
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

/** همگام‌سازی بی‌صدا با SharedPreferences؛ خطا هیچ‌وقت به UI نمی‌رسد. */
export async function pushVoiceConfig(json: string): Promise<boolean> {
  if (!isSmsReaderAvailable) return false;
  return syncVoiceConfig(json);
}

export async function syncVoiceConfigToNative(db: SqlDatabase): Promise<boolean> {
  return pushVoiceConfig(buildVoiceConfigJson(db));
}

/**
 * پخش جمله‌ی نمونه با همان گوینده و همان تنظیمات هشدار؛ برای دکمه‌ی تست در تنظیمات.
 * اگر ماژول بومی در دسترس نباشد `false` برمی‌گردد.
 */
export async function playVoiceAnnouncerTest(settings: VoiceAnnouncerSettings): Promise<boolean> {
  if (!isSmsReaderAvailable) return false;
  return testVoiceAnnouncement(
    VOICE_ANNOUNCER_TEST_TEXT,
    settings.gender,
    settings.chime,
  );
}
