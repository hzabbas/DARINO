import { useEffect } from 'react';

import { useDatabase, useDatabaseReady } from '../db/DatabaseProvider';
import { subscribeDbChange } from '../db/events';
import { buildVoiceConfigJson } from '../features/voiceAnnouncer';
import { pushVoiceConfig } from '../features/voiceAnnouncerAudio';

/**
 * همگام‌سازی خودکار تنظیمات و کارت‌های اعلام صوتی با لایه‌ی بومی.
 *
 * یک بار در شروع اپ و بعد از هر تغییر دیتابیس (حساب، تنظیمات، …) اجرا می‌شود.
 * امضای JSON مقایسه می‌شود تا تغییرهای نامرتبط، نوشتن دوباره در
 * SharedPreferences را تحریک نکنند.
 *
 * عمداً از `useDbQuery` استفاده نمی‌کند: این کامپوننت بیرون از ناوبری رندر می‌شود
 * و قلاب‌های مخصوص صفحه (مثل useFocusEffect) آن‌جا معنا ندارند.
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
        // دیتابیس ممکن است وسط مهاجرت باشد؛ دور بعدی دوباره تلاش می‌شود.
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
