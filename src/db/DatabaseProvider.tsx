import type { SQLiteDatabase } from 'expo-sqlite';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { colors, spacing } from '../theme';
import { getDatabase } from './client';
import { toPersianErrorMessage } from '../utils/errors';

const DatabaseContext = createContext<SQLiteDatabase | null>(null);

type DatabaseState =
  | { status: 'ready'; database: SQLiteDatabase }
  | { status: 'failed'; message: string };

/**
 * دیتابیس را یک بار در شروع اپ باز می‌کند و در اختیار همه‌ی صفحه‌ها می‌گذارد.
 * اگر باز کردن یا ساخت جدول‌ها شکست بخورد، به‌جای کرش یک پیام فارسی نشان می‌دهیم.
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state] = useState<DatabaseState>(() => {
    try {
      return { status: 'ready', database: getDatabase() };
    } catch (error) {
      const message = toPersianErrorMessage(error, 'برنامه نتوانست دیتابیس را باز کند');
      return { status: 'failed', message };
    }
  });

  if (state.status === 'failed') {
    return (
      <View style={styles.errorContainer}>
        <AppText variant="subtitle" style={styles.errorTitle}>
          دیتابیس باز نشد
        </AppText>
        <AppText variant="body" style={styles.errorMessage}>
          {state.message}
        </AppText>
      </View>
    );
  }

  return <DatabaseContext.Provider value={state.database}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): SQLiteDatabase {
  const database = useContext(DatabaseContext);
  if (!database) {
    throw new Error('useDatabase باید داخل DatabaseProvider استفاده شود');
  }
  return database;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  errorTitle: {
    color: colors.expense,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    textAlign: 'center',
    color: colors.textMuted,
  },
});
