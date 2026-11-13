import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing } from '../theme';
import type { SqlDatabase } from '../types/models';
import { toPersianErrorMessage } from '../utils/errors';
import { getDatabase, getDatabaseOpenError, resetDatabaseConnection } from './client';
import { subscribeDbChangeCoalesced } from './events';

const DatabaseContext = createContext<SqlDatabase | null>(null);

/** هر نوشتن در دیتابیس این شمارنده را بالا می‌برد تا همه‌ی کوئری‌ها تازه شوند. */
const RevisionContext = createContext(0);

/** آیا دیتابیس آماده است؟ (برای کارهایی که باید بعد از آماده‌شدن شروع شوند) */
const ReadyContext = createContext(false);

type DatabaseState =
  | { status: 'ready'; database: SqlDatabase }
  | { status: 'failed'; message: string };

/**
 * دیتابیس را یک بار در شروع اپ باز می‌کند و در اختیار همه‌ی صفحه‌ها می‌گذارد.
 *
 * اگر باز کردن یا ساخت جدول‌ها شکست بخورد، به‌جای کرش یک صفحه‌ی بازیابی فارسی با
 * متن دقیق خطا نشان می‌دهیم؛ کاربر می‌تواند دوباره تلاش کند. این مسیر دقیقاً همان
 * جایی است که نسخه‌ی ۳.۱.۰ روی دیتابیس کاربران قدیمی می‌مرد: `migrate()` آن نسخه
 * پیش از افزودن ستون‌ها ایندکس می‌ساخت و با «no such column» پرتاب می‌کرد.
 *
 * ⚠️ قاعده‌ی مهم: این کامپوننت بالاتر از `ThemeProvider` قرار دارد (چون تم از
 * دیتابیس خوانده می‌شود و `ThemeProvider` خودش `useDatabase` دارد)، پس متن‌هایش
 * فقط با `Text` معمولی React Native و استایل ثابت نوشته می‌شوند. `AppText` یا هر
 * چیزی که `useTheme` را صدا بزند، در این لایه در لحظه‌ی شروع خطا می‌دهد و اپ
 * پیش از رسیدن به داشبورد از بین می‌رود.
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DatabaseState | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    try {
      const database = getDatabase();
      const openError = getDatabaseOpenError();
      if (openError) {
        setState({ status: 'failed', message: openError });
        return;
      }
      // مهاجرت خطاهای غیرمهلک را گزارش می‌کند؛ اپ باید بالا بیاید.
      setState({ status: 'ready', database });
    } catch (error) {
      setState({
        status: 'failed',
        message: toPersianErrorMessage(error, 'برنامه نتوانست دیتابیس را باز کند'),
      });
    }
  }, [attempt]);

  // رویدادهای دیتابیس ادغام می‌شوند تا یک عملیات دسته‌ای (همگام‌سازی پیامک،
  // بازیابی پشتیبان) فقط یک بار همه‌ی کوئری‌های فعال را تازه کند؛ هر `useDbQuery`
  // از همین شمارنده تغذیه می‌شود.
  useEffect(() => subscribeDbChangeCoalesced(() => setRevision((value) => value + 1)), []);

  const retry = useCallback(() => {
    resetDatabaseConnection();
    setState(null);
    setAttempt((value) => value + 1);
  }, []);

  const ready = state?.status === 'ready';

  const value = useMemo(() => (state?.status === 'ready' ? state.database : null), [state]);

  if (!state) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>در حال آماده‌سازی دیتابیس…</Text>
      </View>
    );
  }

  if (state.status === 'failed' || !value) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>دیتابیس باز نشد</Text>
        <Text style={styles.errorMessage}>
          {state.status === 'failed' ? state.message : 'خطای نامشخص'}
        </Text>
        <Text style={styles.hint}>
          داده‌هایت پاک نشده‌اند. یک بار دیگر تلاش کن؛ اگر تکرار شد، همین متن را برای
          پشتیبانی بفرست.
        </Text>
        <Pressable onPress={retry} style={styles.retryButton} accessibilityRole="button">
          <Text style={styles.retryText}>تلاش مجدد</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={value}>
      <RevisionContext.Provider value={revision}>
        <ReadyContext.Provider value={ready}>{children}</ReadyContext.Provider>
      </RevisionContext.Provider>
    </DatabaseContext.Provider>
  );
}

export function useDbRevision(): number {
  return useContext(RevisionContext);
}

/** آیا دیتابیس باز و مهاجرت‌شده است؟ */
export function useDatabaseReady(): boolean {
  return useContext(ReadyContext);
}

export function useDatabase(): SqlDatabase {
  const database = useContext(DatabaseContext);
  if (!database) {
    throw new Error('useDatabase باید داخل DatabaseProvider استفاده شود');
  }
  return database;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: '#F8FAFC',
  },
  loadingText: { color: '#64748B' },
  errorTitle: { color: '#EF4444', textAlign: 'center' },
  errorMessage: { textAlign: 'center', color: '#334155' },
  hint: { textAlign: 'center', color: '#64748B' },
  retryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#0EA5E9',
  },
  retryText: { color: '#FFFFFF' },
});
