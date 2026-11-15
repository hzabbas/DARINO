import { NativeModules, Platform } from 'react-native';

export interface SmsSenderInfo {
  sender: string;
  lastBody: string;
  lastDate: number;
  count: number;
}

export interface RawSms {
  id: string;
  sender: string;
  body: string;
  date: number;
  /** امضای پیامک (`sender|timestamp`) که نوتیفیکیشن بومی هم حملش می‌کند */
  fingerprint?: string;
}

export interface SmsNotificationAction {
  /** آیا برنامه از راه نوتیفیکیشن پیامک باز شده است؟ */
  open: boolean;
  /** امضای همان پیامک، اگر نوتیفیکیشن آن را داشته باشد */
  smsFingerprint: string | null;
  /** لینک عمیق (`darino://pending-sms?...`) */
  url: string | null;
}

export interface SmsQueueSnapshot {
  messages: RawSms[];
  /** بالاترین `seq` خوانده‌شده؛ پاک‌کردن فقط تا همین شماره انجام می‌شود */
  maxSeq: number;
}

/** شش پارامتری که همان لحظه از UI مستقیماً به موتور انتخابی می‌رود. */
export interface VoiceAnnouncementTestOptions {
  template: string;
  engine: 'local' | 'neural' | 'clips' | 'system';
  gender: 'female' | 'male';
  chimeEnabled: boolean;
  rate: number;
  amountToman: number;
}

/** نتیجه‌ی واقعی موتور مشخص؛ خطای تست هرگز با صدای موتور دیگر پوشانده نمی‌شود. */
export interface VoiceAnnouncementTestResult {
  ok: boolean;
  engine: string;
  message: string | null;
}

/**
 * وضعیت سرویس دائمی اعلام واریز.
 *
 * `running` از ضربان سرویس می‌آید (هر ۵ دقیقه در SharedPreferences)، پس اگر
 * رام سرویس را کشته باشد `false` می‌شود؛ `enabled` فقط یعنی کاربر در تنظیمات
 * اعلام صوتی را روشن کرده است.
 */
export interface SherpaModelInfo {
  bundled: boolean;
  ready: boolean;
  modelName: string;
  modelBytes: number;
  numSpeakers: number;
}

export interface VoiceGuardStatus {
  enabled: boolean;
  running: boolean;
  /** زمان آخرین ضربان (میلی‌ثانیه‌ی یونیکس)؛ صفر یعنی هرگز */
  lastSeen: number;
}

interface SmsReaderNative {
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  getRecentSmsSenders(): Promise<SmsSenderInfo[]>;
  getSmsMessagesSince(timestamp: number, senders: string[]): Promise<RawSms[]>;
  setBankSenders(senders: string[]): void;
  readQueue(): Promise<string>;
  clearQueue(maxSeq: number): Promise<boolean>;
  getInitialNotificationAction(): Promise<SmsNotificationAction | null>;
  syncVoiceConfig(configJson: string): Promise<boolean>;
  testVoiceAnnouncement(
    engine: VoiceAnnouncementTestOptions['engine'],
    gender: VoiceAnnouncementTestOptions['gender'],
    rate: number,
    template: string,
    chimeEnabled: boolean,
    amountToman: number,
  ): Promise<VoiceAnnouncementTestResult>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
  getVoiceGuardStatus(): Promise<VoiceGuardStatus | null>;
  restartVoiceGuard(): Promise<boolean>;
  openAutoStartSettings(): Promise<boolean>;
  getSherpaInfo(): Promise<SherpaModelInfo>;
  resetSherpaModel(): Promise<boolean>;
  saveSherpaConfig(
    pitch: number,
    gain: number,
    speakerId: number,
    threads: number,
  ): Promise<boolean>;
}

const native: SmsReaderNative | undefined =
  Platform.OS === 'android' ? (NativeModules.SmsReader as SmsReaderNative | undefined) : undefined;

/** آیا ماژول بومی پیامک‌خوان در این بیلد موجود است؟ (در Expo Go و وب نه) */
export const isSmsReaderAvailable = Boolean(native);

export async function hasSmsPermission(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.hasPermission();
  } catch {
    return false;
  }
}

export async function requestSmsPermission(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.requestPermission();
  } catch {
    return false;
  }
}

export async function getRecentSmsSenders(): Promise<SmsSenderInfo[]> {
  if (!native) return [];
  try {
    const rows = await native.getRecentSmsSenders();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function getSmsMessagesSince(timestamp: number, senders: string[]): Promise<RawSms[]> {
  if (!native || senders.length === 0) return [];
  try {
    const rows = await native.getSmsMessagesSince(timestamp, senders);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function setBankSenders(senders: string[]): void {
  try {
    native?.setBankSenders(senders);
  } catch {
    // ماژول بومی در دسترس نیست
  }
}

/**
 * پیامک‌های ذخیره‌شده توسط گیرنده‌ی بومی را برمی‌گرداند **بدون پاک‌کردن صف**.
 *
 * ثبت در صف انجام می‌شود و فقط بعد از ذخیره‌ی موفق در SQLite، با
 * `clearSmsQueue(maxSeq)` ردیف‌های خوانده‌شده پاک می‌شوند. اگر بین خواندن و
 * پاک‌کردن پیامک تازه‌ای برسد، `seq` بزرگ‌تری دارد و در صف می‌ماند.
 */
export async function readSmsQueue(): Promise<SmsQueueSnapshot> {
  const empty: SmsQueueSnapshot = { messages: [], maxSeq: 0 };
  if (!native) return empty;

  try {
    const raw = await native.readQueue();
    const parsed = JSON.parse(raw ?? '{}');
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const maxSeq = Number(parsed?.maxSeq ?? 0);

    const messages = items
      .map((item: any): RawSms => ({
        id: String(item?.seq ?? item?.date ?? Date.now()),
        sender: String(item?.sender ?? ''),
        body: String(item?.body ?? ''),
        date: Number(item?.date ?? Date.now()),
        fingerprint: typeof item?.fingerprint === 'string' ? item.fingerprint : undefined,
      }))
      .filter((item: RawSms) => Boolean(item.sender && item.body));

    return { messages, maxSeq: Number.isFinite(maxSeq) ? maxSeq : 0 };
  } catch {
    return empty;
  }
}

/**
 * اگر برنامه با لمس نوتیفیکیشن پیامک بانکی باز شده باشد، امضای همان پیامک را
 * برمی‌گرداند؛ در غیر این صورت `null`. فقط روی اندروید معنا دارد.
 */
export async function getInitialNotificationAction(): Promise<SmsNotificationAction | null> {
  if (!native?.getInitialNotificationAction) return null;
  try {
    const action = await native.getInitialNotificationAction();
    if (!action) return null;
    return {
      open: Boolean(action.open),
      smsFingerprint: action.smsFingerprint ?? null,
      url: action.url ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * پاک‌کردن ردیف‌های خوانده‌شده‌ی صف بومی؛ فقط **بعد از** ثبت در SQLite صدا زده شود.
 *
 * بدون `maxSeq` کل صف پاک می‌شود؛ همان چیزی که «پاک کردن صف» در تنظیمات می‌خواهد.
 */
export async function clearSmsQueue(maxSeq = Number.MAX_SAFE_INTEGER): Promise<void> {
  try {
    await native?.clearQueue(maxSeq);
  } catch {
    // نادیده بگیر؛ ردیف‌ها دفعه‌ی بعد دوباره خوانده می‌شوند و شناسه‌ی یکتا تکرار را می‌گیرد
  }
}

/**
 * تنظیمات و حساب‌های اعلام صوتی را به SharedPreferences بومی می‌فرستد.
 *
 * گیرنده‌ی پیامک حتی وقتی برنامه بسته است باید بداند کدام کارت‌ها اعلام صوتی
 * دارند؛ تنها راه، همین همگام‌سازی است.
 */
export async function syncVoiceConfig(configJson: string): Promise<boolean> {
  if (!native?.syncVoiceConfig) return false;
  try {
    return Boolean(await native.syncVoiceConfig(configJson));
  } catch {
    return false;
  }
}

/** موتور و همه‌ی پارامترها از شیء زنده‌ی فرم به آرگومان‌های مستقیم native می‌روند. */
export async function testVoiceAnnouncement(
  options: VoiceAnnouncementTestOptions,
): Promise<VoiceAnnouncementTestResult> {
  const unavailable = {
    ok: false,
    engine: options.engine,
    message: 'ماژول صوتی اندروید در این نسخه در دسترس نیست.',
  };
  if (!native?.testVoiceAnnouncement) return unavailable;
  try {
    const result = await native.testVoiceAnnouncement(
      options.engine,
      options.gender,
      options.rate,
      options.template,
      options.chimeEnabled,
      options.amountToman,
    );
    return {
      ok: Boolean(result?.ok),
      engine: String(result?.engine ?? options.engine),
      message: typeof result?.message === 'string'
        ? result.message
        : result?.ok
          ? null
          : 'پخش با این موتور انجام نشد.',
    };
  } catch {
    return unavailable;
  }
}

/**
 * آیا اندروید اجازه می‌دهد دارینو در پس‌زمینه بیدار بماند؟
 *
 * `false` یعنی بهینه‌سازی باتری سرویس دائمی اعلام واریز را می‌کشد (شیائومی،
 * سامسونگ و بعضی ROMها). تنظیمات با همین مقدار بنر «فعال‌سازی کارکرد دائمی»
 * را نشان می‌دهد. روی iOS/وب همیشه `true` است.
 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!native?.isIgnoringBatteryOptimizations) return true;
  try {
    return Boolean(await native.isIgnoringBatteryOptimizations());
  } catch {
    return true;
  }
}

/**
 * صفحه‌ی «بدون بهینه‌سازی باتری» اندروید را برای دارینو باز می‌کند.
 *
 * نتیجه‌ی `true` یعنی صفحه باز شد، نه اینکه کاربر اجازه داد؛ بعد از برگشت به
 * اپ باید دوباره `isIgnoringBatteryOptimizations` خوانده شود.
 */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (!native?.requestIgnoreBatteryOptimizations) return false;
  try {
    return Boolean(await native.requestIgnoreBatteryOptimizations());
  } catch {
    return false;
  }
}

/**
 * وضعیت زنده‌ی سرویس دائمی اعلام واریز برای نمایش در تنظیمات.
 *
 * روی iOS/وب یا بیلد بدون ماژول بومی `null` برمی‌گردد تا ردیف وضعیت اصلاً
 * نشان داده نشود.
 */
export async function getVoiceGuardStatus(): Promise<VoiceGuardStatus | null> {
  if (!native?.getVoiceGuardStatus) return null;
  try {
    const status = await native.getVoiceGuardStatus();
    if (!status) return null;
    return {
      enabled: Boolean(status.enabled),
      running: Boolean(status.running),
      lastSeen: Number(status.lastSeen ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * راه‌اندازی دوباره‌ی سرویس دائمی؛ `true` یعنی سیستم درخواست را پذیرفت.
 *
 * `false` همیشه یعنی خرابی نیست: اندروید ۱۲+ ممکن است شروع سرویس از پس‌زمینه
 * را رد کند و آن‌وقت لایه‌ی بومی با آلارم دوباره تلاش می‌کند.
 */
export async function restartVoiceGuard(): Promise<boolean> {
  if (!native?.restartVoiceGuard) return false;
  try {
    return Boolean(await native.restartVoiceGuard());
  } catch {
    return false;
  }
}

/**
 * صفحه‌ی «اجرای خودکار» سازنده‌ی گوشی (شیائومی/HyperOS، هوآوی، اوپو، ویوو،
 * سامسونگ) را باز می‌کند؛ بدون این اجازه، رام سرویس را بعد از بستن کامل اپ
 * می‌کشد. `true` یعنی یک صفحه باز شد.
 */
export async function openAutoStartSettings(): Promise<boolean> {
  if (!native?.openAutoStartSettings) return false;
  try {
    return Boolean(await native.openAutoStartSettings());
  } catch {
    return false;
  }
}

/** دریافت وضعیت و مشخصات مدل آفلاین Sherpa-ONNX از لایه بومی. */
export async function getSherpaInfo(): Promise<SherpaModelInfo> {
  if (!native?.getSherpaInfo) {
    return { bundled: false, ready: false, modelName: '', modelBytes: 0, numSpeakers: 0 };
  }
  try {
    const res = await native.getSherpaInfo();
    return {
      bundled: Boolean(res?.bundled),
      ready: Boolean(res?.ready),
      modelName: typeof res?.modelName === 'string' ? res.modelName : '',
      modelBytes: Number(res?.modelBytes ?? 0),
      numSpeakers: Number(res?.numSpeakers ?? 0),
    };
  } catch {
    return { bundled: false, ready: false, modelName: '', modelBytes: 0, numSpeakers: 0 };
  }
}

/** استخراج و آماده‌سازی مجدد مدل آفلاین Sherpa در لایه بومی. */
export async function resetSherpaModel(): Promise<boolean> {
  if (!native?.resetSherpaModel) return false;
  try {
    return Boolean(await native.resetSherpaModel());
  } catch {
    return false;
  }
}

/** ذخیره مستقیم تنظیمات اختصاصی Sherpa در SharedPreferences بومی. */
export async function saveSherpaNativeConfig(
  pitch: number,
  gain: number,
  speakerId: number,
  threads: number,
): Promise<boolean> {
  if (!native?.saveSherpaConfig) return false;
  try {
    return Boolean(await native.saveSherpaConfig(pitch, gain, speakerId, threads));
  } catch {
    return false;
  }
}
