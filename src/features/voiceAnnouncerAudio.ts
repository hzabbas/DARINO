import {
  isIgnoringBatteryOptimizations,
  isSmsReaderAvailable,
  requestIgnoreBatteryOptimizations,
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
 *
 * منطق تقسیم مبلغ به کلیپ‌ها در `voiceClipStitcher.ts` است (بدون وابستگی بومی،
 * قابل تست) و از همین‌جا دوباره صادر می‌شود تا مصرف‌کننده‌ها یک مسیر داشته باشند.
 */
export { clipsFor, decomposeThreeDigits, VOICE_ENDING_CLIP } from './voiceClipStitcher';

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

/**
 * آیا دارینو از بهینه‌سازی باتری معاف است؟ روی iOS/وب و در بیلد بدون ماژول
 * بومی `true` برمی‌گردد تا بنر بی‌موردی نشان داده نشود.
 */
export { isIgnoringBatteryOptimizations };

/** باز کردن صفحه‌ی معافیت باتری اندروید؛ `true` یعنی صفحه باز شد. */
export { requestIgnoreBatteryOptimizations };
