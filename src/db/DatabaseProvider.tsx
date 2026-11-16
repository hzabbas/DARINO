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

/** Monotonically increasing revision counter to trigger query re-runs */
const RevisionContext = createContext(0);

/** Whether the database has opened and migrated */
const ReadyContext = createContext(false);

type DatabaseState =
  | { status: 'ready'; database: SqlDatabase }
  | { status: 'failed'; message: string };

/**
 * Root provider that opens the SQLite database and provides database context.
 * Renders fallback recovery screen on fatal initialization failure.
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
      // Non-fatal migration failures allow app to proceed
      setState({ status: 'ready', database });
    } catch (error) {
      setState({
        status: 'failed',
        message: toPersianErrorMessage(error, 'برنامه نتوانست دیتابیس را باز کند'),
      });
    }
  }, [attempt]);

  // Subscribe to coalesced db changes to update revision counter
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

/** Checks if database is open and migrations are complete */
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
