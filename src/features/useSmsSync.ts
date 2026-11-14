import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';

import { allAccountSenders, oldestSyncFrom } from '../db/bankAccounts';
import { useDatabase, useDatabaseReady } from '../db/DatabaseProvider';
import { getSetting, setSetting } from '../db/settings';
import {
  acquireIngestLock,
  ingestBankSms,
  isPendingSmsUrl,
  requestPendingSmsFocus,
  resolveFocusedSmsId,
  type IngestResult,
} from '../features/smsIngest';
import {
  clearSmsQueue,
  getInitialNotificationAction,
  getSmsMessagesSince,
  isSmsReaderAvailable,
  readSmsQueue,
  setBankSenders,
  type RawSms,
} from '../native/smsReader';
import { senderVariants } from '../utils/iranianBanks';

const LAST_SYNC_KEY = 'last_sms_sync';

/**
 * لینک عمیقی که یک‌بار پردازش شده است.
 *
 * `Linking.getInitialURL()` روی اندروید همان intent اولیه را برمی‌گرداند و تا وقتی
 * اپ بسته نشود باقی می‌ماند؛ بدون این نگهدارنده، هر بار فعال‌شدن اپ دوباره صف تایید
 * را باز می‌کرد.
 */
let handledDeepLink: string | null = null;

/**
 * همگام‌سازی پیامک‌های بانکی.
 *
 * در هر ورود به برنامه، به همین ترتیب:
 *  ۱) صف گیرنده‌ی بومی **خوانده** می‌شود (پاک نمی‌شود)
 *  ۲) پیامک‌ها در SQLite ثبت می‌شوند (شناسه‌ی یکتا تکرار را می‌گیرد)
 *  ۳) بار اول، تاریخچه از «مرز همگام‌سازی هر حساب» خوانده می‌شود، نه از یک پنجره‌ی
 *     ثابت چندروزه: حساب تازه‌وصل‌شده صف تایید را با ماه‌ها پیامک قدیمی پر نمی‌کند
 *  ۴) فقط بعد از ثبت موفق، ردیف‌های خوانده‌شده‌ی صف بومی پاک می‌شوند
 *  ۵) سیگنال focus (لمس نوتیفیکیشن یا تازه‌ترین پیامک) فرستاده می‌شود
 *
 * هیچ پولینگ یا سرویس پس‌زمینه‌ای اجرا نمی‌شود.
 *
 * همگام‌سازی از چند مسیر صدا زده می‌شود (اولین mount، active شدن اپ و رفرش دستی)؛
 * پس با یک قفل، اجرای هم‌زمان گرفته می‌شود تا یک پیامک دو بار پردازش نشود.
 */
export function useSmsSync(): void {
  const database = useDatabase();
  const ready = useDatabaseReady();

  useEffect(() => {
    if (!isSmsReaderAvailable || !ready) return;

    let disposed = false;

    const ingestAll = (messages: RawSms[]): IngestResult[] =>
      messages.map((sms) =>
        ingestBankSms(database, {
          sender: sms.sender,
          body: sms.body,
          receivedAt: new Date(sms.date),
        }),
      );

    /** تازه‌ترین پیامکی که در همین اجرا وارد صف شد. */
    const newestQueued = (results: IngestResult[]): IngestResult | null => {
      let newest: IngestResult | null = null;
      let newestTime = Number.NEGATIVE_INFINITY;
      for (const result of results) {
        if (result.status !== 'queued' || !result.pending) continue;
        const time = new Date(result.pending.date).getTime();
        if (Number.isFinite(time) && time > newestTime) {
          newestTime = time;
          newest = result;
        }
      }
      return newest;
    };

    const run = async () => {
      const release = acquireIngestLock();
      if (!release) return;

      try {
        const results: IngestResult[] = [];
        let queueMaxSeq = 0;

        const senders = allAccountSenders(database);
        if (senders.length > 0) {
          // برای کوئری دفتر پیامک، همه‌ی شکل‌های ممکن هر سرشماره فرستاده می‌شود
          // («09999987641» و «+989999987641» و …) تا هیچ پیامکی جا نماند.
          setBankSenders(senders);

          const snapshot = await readSmsQueue();
          if (disposed) return;
          queueMaxSeq = snapshot.maxSeq;
          results.push(...ingestAll(snapshot.messages));

          const lastSync = Number(getSetting(database, LAST_SYNC_KEY) ?? 0);
          if (!lastSync) {
            // مرز همگام‌سازی حساب‌ها مبنای خواندن تاریخچه است؛ نه یک پنجره‌ی ثابت.
            const since = oldestSyncFrom(database) ?? Date.now();
            const variants = Array.from(new Set(senders.flatMap((sender) => senderVariants(sender))));
            const history = await getSmsMessagesSince(since, variants);
            if (disposed) return;
            results.push(...ingestAll(history));
          }

          // همه‌ی ثبت‌های SQLite تمام شد؛ حالا امن است که صف بومیِ خوانده‌شده را
          // پاک کنیم. ردیف‌هایی که بعد از خواندن رسیده‌اند seq بزرگ‌تری دارند و
          // دست‌نخورده می‌مانند.
          if (queueMaxSeq > 0) {
            await clearSmsQueue(queueMaxSeq);
          }
          setSetting(database, LAST_SYNC_KEY, String(Date.now()));
        }

        // مسیر نوتیفیکیشن/لینک عمیق، مستقل از این‌که پیامک تازه‌ای آمده باشد یا نه.
        let focused = false;
        const action = await getInitialNotificationAction();
        if (action?.open) {
          requestPendingSmsFocus(resolveFocusedSmsId(database, action.smsFingerprint, action.url));
          focused = true;
        }

        // مسیر استاندارد React Native برای شروع سرد و warm: URL لینک عمیق.
        // (extraهای intent فقط در شروع سرد در دسترس‌اند، ولی URL در هر دو حالت می‌آید.)
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl !== handledDeepLink && isPendingSmsUrl(initialUrl)) {
          handledDeepLink = initialUrl;
          requestPendingSmsFocus(resolveFocusedSmsId(database, null, initialUrl));
          focused = true;
        }
        if (disposed) return;

        // اگر کاربر از نوتیفیکیشن یک پیامک مشخص را انتخاب کرده، همان اولویت دارد؛
        // وگرنه تازه‌ترین پیامکِ همین اجرا پیشنهاد می‌شود.
        if (!focused) {
          const newest = newestQueued(results);
          if (newest?.pending) {
            requestPendingSmsFocus(newest.pending.sms_id);
          }
        }
      } finally {
        release();
      }
    };

    // اولین اجرا نه هم‌زمان با بالا آمدن اپ، بلکه کمی بعد از اولین فریم انجام می‌شود:
    // خواندن دفتر پیامک و ساختن نوتیفیکیشن در همان لحظه‌ی سنگینِ startup می‌تواند
    // روی دستگاه‌های کند اپ را زمین بزند. (`InteractionManager` در RN 0.88 حذف شده
    // است، پس از یک تایمر کوتاه استفاده می‌شود؛ AppState بقیه‌ی همگام‌سازی‌ها را
    // بعداً و بی‌درنگ انجام می‌دهد.)
    const startTimer = setTimeout(() => {
      if (disposed) return;
      run().catch(() => {
        // شکست همگام‌سازی نباید ورود به برنامه را متوقف کند
      });
    }, 400);

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
      clearTimeout(startTimer);
      subscription.remove();
      linkingSubscription.remove();
    };
  }, [database, ready]);
}
