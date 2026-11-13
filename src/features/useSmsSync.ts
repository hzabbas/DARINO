import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { allAccountSenders } from '../db/bankAccounts';
import { useDatabase } from '../db/DatabaseProvider';
import { getSetting, setSetting } from '../db/settings';
import { acquireIngestLock, ingestBankSms } from '../features/smsIngest';
import {
  drainSmsQueue,
  getSmsMessagesSince,
  isSmsReaderAvailable,
  setBankSenders,
} from '../native/smsReader';
import { senderVariants } from '../utils/iranianBanks';

const LAST_SYNC_KEY = 'last_sms_sync';
const FIRST_SYNC_WINDOW = 7 * 24 * 60 * 60 * 1000;

/**
 * همگام‌سازی پیامک‌های بانکی.
 *
 * در هر ورود به برنامه:
 *  ۱) صف گیرنده‌ی بومی تخلیه می‌شود (پیامک‌هایی که وقتی اپ بسته بود آمده‌اند)
 *  ۲) بار اول، پیامک‌های ۷ روز اخیر از سرشماره‌های حساب‌ها خوانده می‌شوند
 * هیچ پولینگ یا سرویس پس‌زمینه‌ای اجرا نمی‌شود.
 *
 * همگام‌سازی از سه مسیر صدا زده می‌شود (اولین mount، active شدن اپ و رفرش دستی)؛
 * پس با یک قفل، اجرای هم‌زمان گرفته می‌شود تا یک پیامک دو بار پردازش نشود.
 */
export function useSmsSync(): void {
  const database = useDatabase();
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (!isSmsReaderAvailable) return;

    let disposed = false;

    const run = async () => {
      if (isSyncingRef.current) return;

      const release = acquireIngestLock();
      if (!release) return;

      isSyncingRef.current = true;

      try {
        const senders = allAccountSenders(database);
        if (senders.length === 0) return;

        setBankSenders(senders);

        const queued = await drainSmsQueue();
        if (disposed) return;

        for (const sms of queued) {
          ingestBankSms(database, {
            sender: sms.sender,
            body: sms.body,
            receivedAt: new Date(sms.date),
          });
        }

        const lastSync = Number(getSetting(database, LAST_SYNC_KEY) ?? 0);
        if (!lastSync) {
          const since = Date.now() - FIRST_SYNC_WINDOW;
          // برای کوئری دفتر پیامک، همه‌ی شکل‌های ممکن هر سرشماره فرستاده می‌شود
          // («09999987641» و «+989999987641» و …) تا هیچ پیامکی جا نماند.
          const variants = Array.from(
            new Set(senders.flatMap((sender) => senderVariants(sender))),
          );
          const history = await getSmsMessagesSince(since, variants);
          if (disposed) return;

          for (const sms of history) {
            ingestBankSms(database, {
              sender: sms.sender,
              body: sms.body,
              receivedAt: new Date(sms.date),
            });
          }
        }

        setSetting(database, LAST_SYNC_KEY, String(Date.now()));
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

    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [database]);
}
