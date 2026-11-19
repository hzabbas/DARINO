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

/** Handled deep-link URL cache to prevent duplicate modal opens on resume */
let handledDeepLink: string | null = null;

/**
 * Hook for synchronizing incoming bank SMS messages into SQLite.
 * Executes on cold start and AppState 'active' transitions.
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

    /** Newest SMS queued during current run */
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
        // Sync monitored senders to native receiver
        setBankSenders(senders);

        const snapshot = await readSmsQueue();
        if (disposed) return;
        queueMaxSeq = snapshot.maxSeq;
        results.push(...ingestAll(snapshot.messages));

        if (senders.length > 0) {
          const lastSync = Number(getSetting(database, LAST_SYNC_KEY) ?? 0);
          const since = lastSync || (oldestSyncFrom(database) ?? Date.now());
          const variants = Array.from(new Set(senders.flatMap((sender) => senderVariants(sender))));
          const history = await getSmsMessagesSince(since, variants);
          if (disposed) return;
          results.push(...ingestAll(history));
        }

        // Clear processed rows up to queueMaxSeq after SQLite commit
        if (queueMaxSeq > 0) {
          await clearSmsQueue(queueMaxSeq);
        }
        if (senders.length > 0) {
          setSetting(database, LAST_SYNC_KEY, String(Date.now()));
        }

        // Notification and deep link launch handling
        let focused = false;
        const action = await getInitialNotificationAction();
        if (action?.open) {
          requestPendingSmsFocus(resolveFocusedSmsId(database, action.smsFingerprint, action.url));
          focused = true;
        }

        // Initial URL check for warm/cold launch
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl !== handledDeepLink && isPendingSmsUrl(initialUrl)) {
          handledDeepLink = initialUrl;
          requestPendingSmsFocus(resolveFocusedSmsId(database, null, initialUrl));
          focused = true;
        }
        if (disposed) return;

        // Auto-focus on newest queued SMS if not opened via notification
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

    // Stagger first run slightly past first paint
    const startTimer = setTimeout(() => {
      if (disposed) return;
      run().catch(() => {
        // Non-blocking sync failure
      });
    }, 400);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        run().catch(() => {});
      }
    });

    // Handle deep links when app is resumed from background
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
