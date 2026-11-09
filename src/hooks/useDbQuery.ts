import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { SqlDatabase } from '../types/models';
import { useDatabase } from '../db/DatabaseProvider';
import { toPersianErrorMessage } from '../utils/errors';

interface DbQueryResult<T> {
  data: T | null;
  error: string | null;
  /** true یعنی کوئری حداقل یک بار اجرا شده است */
  loaded: boolean;
  reload: () => void;
}

/**
 * کوئری همگام روی دیتابیس که هر بار صفحه فوکوس می‌گیرد دوباره اجرا می‌شود
 * (مثلاً بعد از ثبت تراکنش و برگشت به داشبورد) تا داده‌ها تازه بمانند.
 */
export function useDbQuery<T>(
  select: (database: SqlDatabase) => T,
  deps: unknown[] = [],
): DbQueryResult<T> {
  const database = useDatabase();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
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
        setError(toPersianErrorMessage(queryError, 'خواندن اطلاعات ناموفق بود'));
      } finally {
        setLoaded(true);
      }
      // select عمداً در وابستگی‌ها نیست؛ ورودی‌هایش در deps می‌آیند.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [database, refreshToken, ...deps]),
  );

  return { data, error, loaded, reload };
}
