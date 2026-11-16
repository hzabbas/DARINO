import { useEffect } from 'react';

import { useDatabase, useDatabaseReady } from '../db/DatabaseProvider';
import { subscribeDbChange } from '../db/events';
import { buildVoiceConfigJson } from '../features/voiceAnnouncer';
import { pushVoiceConfig } from '../features/voiceAnnouncerAudio';

/**
 * Automatic sync of voice announcer settings and accounts to native SharedPreferences.
 */
export function VoiceAnnouncerSync() {
  const database = useDatabase();
  const ready = useDatabaseReady();

  useEffect(() => {
    if (!ready) return;

    let disposed = false;
    let lastSignature = '';

    const sync = () => {
      try {
        const json = buildVoiceConfigJson(database);
        if (disposed || json === lastSignature) return;
        lastSignature = json;
        void pushVoiceConfig(json);
      } catch {
        // Retry on next DB event if database is migrating.
      }
    };

    sync();
    const unsubscribe = subscribeDbChange(sync);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [database, ready]);

  return null;
}
