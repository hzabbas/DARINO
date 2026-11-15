import {
  getVoiceGuardStatus,
  isIgnoringBatteryOptimizations,
  isSmsReaderAvailable,
  openAutoStartSettings,
  requestIgnoreBatteryOptimizations,
  restartVoiceGuard,
  syncVoiceConfig,
  testVoiceAnnouncement,
  type VoiceAnnouncementTestResult,
  type VoiceGuardStatus,
} from '../native/smsReader';
import type { SqlDatabase } from '../types/models';
import {
  buildVoiceAnnouncementTestOptions,
  buildVoiceConfigJson,
  type VoiceAnnouncerSettings,
  type VoiceAnnouncerService,
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
export async function playVoiceAnnouncerTest(
  settings: VoiceAnnouncerSettings,
  amountToman?: number,
  service: VoiceAnnouncerService = settings.service,
): Promise<VoiceAnnouncementTestResult> {
  if (!isSmsReaderAvailable) {
    return { ok: false, engine: service, message: 'اعلام صوتی فقط در نسخه‌ی اندروید در دسترس است.' };
  }
  return testVoiceAnnouncement(buildVoiceAnnouncementTestOptions(settings, amountToman, service));
}
export type { VoiceAnnouncementTestResult };

/**
 * آیا دارینو از بهینه‌سازی باتری معاف است؟ روی iOS/وب و در بیلد بدون ماژول
 * بومی `true` برمی‌گردد تا بنر بی‌موردی نشان داده نشود.
 */
export { isIgnoringBatteryOptimizations };

/** باز کردن صفحه‌ی معافیت باتری اندروید؛ `true` یعنی صفحه باز شد. */
export { requestIgnoreBatteryOptimizations };

/** وضعیت زنده‌ی سرویس دائمی (فعال/متوقف) برای ردیف وضعیت تنظیمات. */
export { getVoiceGuardStatus };
export type { VoiceGuardStatus };

/** راه‌اندازی دوباره‌ی سرویس دائمی؛ `false` یعنی رام اجازه نداد. */
export { restartVoiceGuard };

/** باز کردن صفحه‌ی «اجرای خودکار» سازنده‌ی گوشی. */
export { openAutoStartSettings };
