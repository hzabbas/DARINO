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
  testVoiceAnnouncement(text: string, gender: string, playChime: boolean): Promise<boolean>;
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

/** پخش فوری یک جمله با گوینده‌ی طبیعی؛ برای دکمه‌ی «تست صدای گوینده». */
export async function testVoiceAnnouncement(
  text: string,
  gender: string,
  playChime: boolean,
): Promise<boolean> {
  if (!native?.testVoiceAnnouncement) return false;
  try {
    return Boolean(await native.testVoiceAnnouncement(text, gender, playChime));
  } catch {
    return false;
  }
}
