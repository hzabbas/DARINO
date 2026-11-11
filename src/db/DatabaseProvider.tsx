import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { spacing } from '../theme';
import type { SqlDatabase } from '../types/models';
import { getDatabase } from './client';
import { subscribeDbChange } from './events';
import { toPersianErrorMessage } from '../utils/errors';

const DatabaseContext = createContext<SqlDatabase | null>(null);

/** هر نوشتن در دیتابیس این شمارنده را بالا می‌برد تا همه‌ی کوئری‌ها تازه شوند. */
const RevisionContext = createContext(0);

type DatabaseState =
  | { status: 'ready'; database: SqlDatabase }
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

  const [revision, setRevision] = useState(0);

  useEffect(() => subscribeDbChange(() => setRevision((value) => value + 1)), []);

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

  return (
    <DatabaseContext.Provider value={state.database}>
      <RevisionContext.Provider value={revision}>{children}</RevisionContext.Provider>
    </DatabaseContext.Provider>
  );
}

export function useDbRevision(): number {
  return useContext(RevisionContext);
}

export function useDatabase(): SqlDatabase {
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
    backgroundColor: '#F8FAFC',
  },
  errorTitle: {
    color: '#EF4444',
    marginBottom: spacing.sm,
  },
  errorMessage: {
    textAlign: 'center',
    color: '#64748B',
  },
});
