import type { SQLiteDatabase } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useDatabase } from '../db/DatabaseProvider';

interface DbQueryResult<T> {
  data: T | null;
  error: string | null;
  reload: () => void;
}

/**
 * کوئری همگام روی دیتابیس که هر بار صفحه فوکوس می‌گیرد دوباره اجرا می‌شود
 * (مثلاً بعد از ثبت تراکنش و برگشت به داشبورد) تا داده‌ها تازه بمانند.
 */
export function useDbQuery<T>(
  select: (database: SQLiteDatabase) => T,
  deps: unknown[] = [],
): DbQueryResult<T> {
  const database = useDatabase();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const reload = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      try {
        setData(select(database));
        setError(null);
      } catch (queryError) {
        setError(queryError instanceof Error ? queryError.message : 'خواندن اطلاعات ناموفق بود');
      }
      // select عمداً در وابستگی‌ها نیست؛ ورودی‌هایش در deps می‌آیند.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [database, refreshToken, ...deps]),
  );

  return { data, error, reload };
}
