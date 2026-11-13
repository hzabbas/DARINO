import type { SqlDatabase } from '../types/models';
import { listPendingSms } from '../db/pendingSms';
import { sendersMatch } from '../utils/iranianBanks';

/**
 * «کدام پیامک را همین حالا باز کن؟»
 *
 * وقتی کاربر روی نوتیفیکیشن پیامک بانکی می‌زند یا پیامک تازه‌ای وارد برنامه می‌شود،
 * باید مستقیم روی همان تراکنش در صف تایید باز شود؛ نه این‌که اول داشبورد را ببیند و
 * خودش بنر را پیدا کند. این ماژول یک سیگنال سبک و بدون وابستگی است: لایه‌ی داده
 * (یا لینک عمیق) سیگنال را می‌دهد و داشبورد آن را مصرف می‌کند.
 */
type PendingFocus = {
  /** `sms_id` همان پیامک، اگر معلوم باشد */
  smsId: string | null;
  timestamp: number;
};

let pendingFocus: PendingFocus | null = null;
const listeners = new Set<(focus: PendingFocus) => void>();

/** درخواست باز کردن صف تایید؛ داشبورد فوراً آن را مصرف می‌کند. */
export function requestPendingSmsFocus(smsId: string | null = null, now = Date.now()): void {
  pendingFocus = { smsId, timestamp: now };
  for (const listener of listeners) {
    listener(pendingFocus);
  }
}

/** آخرین درخواست را برمی‌گرداند و پاک می‌کند (برای ورود اولیه به برنامه). */
export function consumePendingSmsFocus(): PendingFocus | null {
  const current = pendingFocus;
  pendingFocus = null;
  return current;
}

/** آیا درخواست بی‌مصرفی وجود دارد؟ (بدون پاک کردن) */
export function peekPendingSmsFocus(): PendingFocus | null {
  return pendingFocus;
}

/** اشتراک روی درخواست‌های تازه؛ خروجی، تابع لغو اشتراک است. */
export function subscribePendingSmsFocus(listener: (focus: PendingFocus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** فقط برای تست‌ها: وضعیت را به ابتدا برمی‌گرداند. */
export function resetPendingSmsFocus(): void {
  pendingFocus = null;
  listeners.clear();
}

/**
 * شناسه‌ی پیامک از روی «امضای» نوتیفیکیشن بومی.
 *
 * سمت اندروید لینک عمیق `darino://pending-sms?sms=<fingerprint>&open=1` را می‌فرستد؛
 * همان امضا در `SmsStore` روی ردیف پیامک هم ذخیره می‌شود تا بتوان ردیف را پیدا کرد.
 */
export function smsFingerprintFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = 'darino://';
  if (!url.startsWith(marker)) return null;

  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;

  for (const pair of url.slice(queryStart + 1).split('&')) {
    const [rawKey, rawValue] = pair.split('=');
    if (rawKey === 'sms' && rawValue) {
      return decodeURIComponent(rawValue);
    }
  }
  return null;
}

/** آیا این URL درخواست باز کردن صف تایید است؟ */
export function isPendingSmsUrl(url: string | null | undefined): boolean {
  if (!url || !url.startsWith('darino://')) return false;
  return url.includes('pending-sms') || url.includes('openPendingSms=1') || url.includes('open=1');
}

/**
 * تبدیل «امضای نوتیفیکیشن» (`sender|timestamp`) به ردیف صف تایید.
 *
 * نوتیفیکیشن بومی امضا را می‌فرستد تا لمس آن دقیقاً همان تراکنش را باز کند؛ ولی
 * `sms_id` ردیف در دیتابیس از متن پیامک ساخته می‌شود. پس این‌جا با فرستنده
 * (نرمال‌شده، با همان قاعده‌ی سرشماره‌ها) و مهر زمانی (در حد یک ثانیه) تطبیق می‌دهیم.
 */
export function resolveFocusedSmsId(
  db: SqlDatabase,
  fingerprint: string | null,
  url: string | null = null,
): string | null {
  const raw = fingerprint ?? smsFingerprintFromUrl(url);
  if (!raw) return null;

  const separator = raw.lastIndexOf('|');
  if (separator <= 0) return null;

  const sender = raw.slice(0, separator);
  const timestamp = Number(raw.slice(separator + 1));
  if (!Number.isFinite(timestamp)) return null;

  const match = listPendingSms(db, 'pending').find(
    (row) =>
      Math.abs(new Date(row.date).getTime() - timestamp) < 1000 && sendersMatch(row.sender, sender),
  );
  return match?.sms_id ?? null;
}
