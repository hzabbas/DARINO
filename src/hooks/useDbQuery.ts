import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { toPersianErrorMessage } from '../utils/errors';
import { useDatabase, useDbRevision } from '../db/DatabaseProvider';
import type { SqlDatabase } from '../types/models';

interface DbQueryResult<T> {
  data: T | null;
  error: string | null;
  /** با محاسبه‌ی همگام، داده بلافاصله در دسترس است */
  loaded: boolean;
  reload: () => void;
}

/**
 * کوئری همگام روی دیتابیس که با هر تغییر (ثبت/ویرایش/حذف/بازیابی) و با هر بار
 * فوکوس‌گرفتن صفحه دوباره اجرا می‌شود؛ بنابراین همه‌ی تب‌های باز هم‌زمان به‌روز می‌شوند.
 */
export function useDbQuery<T>(
  select: (database: SqlDatabase) => T,
  deps: unknown[] = [],
): DbQueryResult<T> {
  const database = useDatabase();
  const revision = useDbRevision();
  const [refreshToken, setRefreshToken] = useState(0);
  const [focusToken, setFocusToken] = useState(0);

  const reload = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocusToken((token) => token + 1);
    }, []),
  );

  const result = useMemo(() => {
    try {
      return { data: select(database) as T | null, error: null as string | null };
    } catch (queryError) {
      return {
        data: null as T | null,
        error: toPersianErrorMessage(queryError, 'خواندن اطلاعات ناموفق بود'),
      };
    }
    // select عمداً در وابستگی‌ها نیست؛ ورودی‌هایش در deps می‌آیند.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, revision, refreshToken, focusToken, ...deps]);

  return { data: result.data, error: result.error, loaded: true, reload };
}
