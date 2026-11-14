import {
  isSmsReaderAvailable,
  syncVoiceConfig,
  testVoiceAnnouncement,
} from '../native/smsReader';
import type { SqlDatabase } from '../types/models';
import {
  buildVoiceAnnouncementTestOptions,
  buildVoiceConfigJson,
  type VoiceAnnouncerSettings,
} from './voiceAnnouncer';

/**
 * پخش و همگام‌سازی بومی اعلام صوتی واریز.
 *
 * جدا از `voiceAnnouncer.ts` است تا مدل تنظیمات بدون وابستگی به React Native و
 * با `node:test` قابل تست بماند؛ همه‌ی صداهای این فایل فقط روی اندروید معنا دارند.
 */

/** همگام‌سازی بی‌صدا با SharedPreferences؛ خطا هیچ‌وقت به UI نمی‌رسد. */
export async function pushVoiceConfig(json: string): Promise<boolean> {
  if (!isSmsReaderAvailable) return false;
  return syncVoiceConfig(json);
}

export async function syncVoiceConfigToNative(db: SqlDatabase): Promise<boolean> {
  return pushVoiceConfig(buildVoiceConfigJson(db));
}

/**
 * پخش جمله‌ی نمونه با همان سرویس، قالب و سرعتی که کاربر انتخاب کرده؛ برای دکمه‌ی
 * تست در تنظیمات. جمله در لایه‌ی بومی از همان قالب ساخته می‌شود تا تست واقعاً
 * همان مسیری را برود که پیامک واقعی می‌رود.
 */
export async function playVoiceAnnouncerTest(settings: VoiceAnnouncerSettings): Promise<boolean> {
  if (!isSmsReaderAvailable) return false;
  return testVoiceAnnouncement(buildVoiceAnnouncementTestOptions(settings));
}
