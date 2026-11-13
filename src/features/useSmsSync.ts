import { useEffect, useRef } from 'react';
import { AppState, Linking } from 'react-native';

import { allAccountSenders, oldestSyncFrom } from '../db/bankAccounts';
import { useDatabase } from '../db/DatabaseProvider';
import { listPendingSms } from '../db/pendingSms';
import { getSetting, setSetting } from '../db/settings';
import { acquireIngestLock, ingestBankSms, type IngestResult } from '../features/smsIngest';
import { isPendingSmsUrl, requestPendingSmsFocus, resolveFocusedSmsId } from './smsFocus';
import {
  drainSmsQueue,
  getInitialNotificationAction,
  getSmsMessagesSince,
  isSmsReaderAvailable,
  setBankSenders,
  type RawSms,
} from '../native/smsReader';
import type { SqlDatabase } from '../types/models';
import { senderVariants, sendersMatch } from '../utils/iranianBanks';

const LAST_SYNC_KEY = 'last_sms_sync';

/**
 * لینک عمیقی که یک‌بار پردازش شده است.
 *
 * `Linking.getInitialURL()` روی اندروید همان intent اولیه را برمی‌گرداند و تا وقتی
 * اپ بسته نشود باقی می‌ماند؛ بدون این نگهدارنده، هر بار فعال‌شدن اپ دوباره صف تایید
 * را باز می‌کرد.
 */
let handledDeepLink: string | null = null;

/** فقط برای تست‌ها. */
export function resetHandledDeepLink(): void {
  handledDeepLink = null;
}

/**
 * همگام‌سازی پیامک‌های بانکی.
 *
 * در هر ورود به برنامه:
 *  ۱) صف گیرنده‌ی بومی تخلیه می‌شود (پیامک‌هایی که وقتی اپ بسته بود آمده‌اند)
 *  ۲) بار اول، تاریخچه از «مرز همگام‌سازی هر حساب» خوانده می‌شود، نه از یک پنجره‌ی
 *     ثابت چندروزه: حساب تازه‌وصل‌شده صف تایید را با ماه‌ها پیامک قدیمی پر نمی‌کند
 * هیچ پولینگ یا سرویس پس‌زمینه‌ای اجرا نمی‌شود.
 *
 * همگام‌سازی از چند مسیر صدا زده می‌شود (اولین mount، active شدن اپ و رفرش دستی)؛
 * پس با یک قفل، اجرای هم‌زمان گرفته می‌شود تا یک پیامک دو بار پردازش نشود.
 *
 * اگر برنامه با لمس نوتیفیکیشن پیامک باز شده باشد، یا همین حالا پیامک تازه‌ای در
 * حالت فعال (foreground) برسد، یک سیگنال focus داده می‌شود تا داشبورد مستقیم صف
 * تایید را روی همان تراکنش باز کند.
 */
export function useSmsSync(): void {
  const database = useDatabase();
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (!isSmsReaderAvailable) return;

    let disposed = false;

    const ingestAll = (messages: RawSms[]): IngestResult[] =>
      messages.map((sms) =>
        ingestBankSms(database, {
          sender: sms.sender,
          body: sms.body,
          receivedAt: new Date(sms.date),
        }),
      );

    const run = async () => {
      if (isSyncingRef.current) return;

      const release = acquireIngestLock();
      if (!release) return;

      isSyncingRef.current = true;

      try {
        // مسیر نوتیفیکیشن/لینک عمیق، مستقل از این‌که پیامک تازه‌ای آمده باشد یا نه
        const action = await getInitialNotificationAction();
        if (action?.open) {
          const smsId = resolveFocusedSmsId(database, action.smsFingerprint, action.url);
          requestPendingSmsFocus(smsId);
        }

        // مسیر استاندارد React Native برای شروع سرد و warm: URL لینک عمیق.
        // (extra‌های intent فقط در شروع سرد در دسترس‌اند، ولی URL در هر دو حالت می‌آید.)
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl !== handledDeepLink && isPendingSmsUrl(initialUrl)) {
          handledDeepLink = initialUrl;
          requestPendingSmsFocus(resolveFocusedSmsId(database, null, initialUrl));
        }
        if (disposed) return;

        const senders = allAccountSenders(database);
        if (senders.length === 0) return;

        setBankSenders(senders);

        const queued = await drainSmsQueue();
        if (disposed) return;

        const results = ingestAll(queued);

        const lastSync = Number(getSetting(database, LAST_SYNC_KEY) ?? 0);
        if (!lastSync) {
          // مرز همگام‌سازی حساب‌ها مبنای خواندن تاریخچه است؛ نه یک پنجره‌ی ثابت.
          const since = oldestSyncFrom(database) ?? Date.now();
          // برای کوئری دفتر پیامک، همه‌ی شکل‌های ممکن هر سرشماره فرستاده می‌شود
          // («09999987641» و «+989999987641» و …) تا هیچ پیامکی جا نماند.
          const variants = Array.from(new Set(senders.flatMap((sender) => senderVariants(sender))));
          const history = await getSmsMessagesSince(since, variants);
          if (disposed) return;

          results.push(...ingestAll(history));
        }

        setSetting(database, LAST_SYNC_KEY, String(Date.now()));

        // تازه‌ترین پیامکی که در همین اجرا وارد صف شد؛ تا کاربر با یک لمس
        // دسته‌بندی‌اش را انتخاب کند.
        const newest = results.filter((result) => result.status === 'queued' && result.pending);
        if (newest.length > 0) {
          requestPendingSmsFocus(newest[0].pending?.sms_id ?? null);
        }
      } finally {
        isSyncingRef.current = false;
        release();
      }
    };

    run().catch(() => {
      // شکست همگام‌سازی نباید ورود به برنامه را متوقف کند
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        run().catch(() => {});
      }
    });

    // شروع warm: اپ در پس‌زمینه بوده و کاربر روی نوتیفیکیشن زده است. در این حالت
    // intent اکتیویتی عوض نمی‌شود، پس فقط رویداد url در دسترس است.
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      if (!isPendingSmsUrl(url) || url === handledDeepLink) return;
      handledDeepLink = url;
      requestPendingSmsFocus(resolveFocusedSmsId(database, null, url));
    });

    return () => {
      disposed = true;
      subscription.remove();
      linkingSubscription.remove();
    };
  }, [database]);
}
