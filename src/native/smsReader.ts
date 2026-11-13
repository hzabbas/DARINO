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

interface SmsReaderNative {
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  getRecentSmsSenders(): Promise<SmsSenderInfo[]>;
  getSmsMessagesSince(timestamp: number, senders: string[]): Promise<RawSms[]>;
  setBankSenders(senders: string[]): void;
  drainQueue(): Promise<string>;
  clearQueue(): Promise<boolean>;
  getInitialNotificationAction(): Promise<SmsNotificationAction | null>;
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

/** پیامک‌های ذخیره‌شده توسط گیرنده‌ی بومی را برمی‌گرداند و صف را خالی می‌کند. */
export async function drainSmsQueue(): Promise<RawSms[]> {
  if (!native) return [];
  try {
    const raw = await native.drainQueue();
    const parsed = JSON.parse(raw ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.date ?? Date.now()),
        sender: String(item?.sender ?? ''),
        body: String(item?.body ?? ''),
        date: Number(item?.date ?? Date.now()),
        fingerprint: typeof item?.fingerprint === 'string' ? item.fingerprint : undefined,
      }))
      .filter((item) => item.sender && item.body);
  } catch {
    return [];
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

export async function clearSmsQueue(): Promise<void> {
  try {
    await native?.clearQueue();
  } catch {
    // نادیده بگیر
  }
}
