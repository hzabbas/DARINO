import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BalanceHero } from '../../components/BalanceHero';
import { EmptyState } from '../../components/EmptyState';
import { RangeTabs } from '../../components/RangeTabs';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { TransactionRow } from '../../components/TransactionRow';
import { useDatabase } from '../../db/DatabaseProvider';
import { deleteTransaction, getSummary, listTransactions } from '../../db/transactions';
import { useDbQuery } from '../../hooks/useDbQuery';
import { colors, radius, spacing } from '../../theme';
import type { MonthlySummary, TransactionWithCategory } from '../../types/models';
import { formatToman } from '../../utils/currency';
import { toPersianDigits } from '../../utils/digits';
import { formatTodayLabel } from '../../utils/jalali';
import {
  DASHBOARD_RANGES,
  getRangeBounds,
  getRangeCaption,
  type DashboardRange,
} from '../../utils/ranges';

const EMPTY_SUMMARY: MonthlySummary = { income: 0, expense: 0, balance: 0 };

export default function DashboardScreen() {
  const database = useDatabase();
  const listRef = useRef<FlatList<TransactionWithCategory>>(null);
  const [range, setRange] = useState<DashboardRange>('month');

  const { data, loaded, reload } = useDbQuery(
    (db) => {
      const bounds = getRangeBounds(range);
      return {
        summary: getSummary(db, bounds),
        transactions: listTransactions(db, bounds),
      };
    },
    [range],
  );

  const summary = data?.summary ?? EMPTY_SUMMARY;
  const transactions = data?.transactions ?? [];
  const rangeLabel = DASHBOARD_RANGES.find((option) => option.value === range)?.label ?? '';

  const handleRangeChange = (nextRange: DashboardRange) => {
    setRange(nextRange);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const handleEdit = (transaction: TransactionWithCategory) => {
    router.push(`/edit/${transaction.id}`);
  };

  const handleDelete = (transaction: TransactionWithCategory) => {
    const title = transaction.category_name ?? 'این تراکنش';
    Alert.alert(
      'حذف تراکنش',
      `${title} به مبلغ ${formatToman(transaction.amount)} حذف شود؟ این کار قابل بازگشت نیست.`,
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            try {
              deleteTransaction(database, transaction.id);
              reload();
            } catch (error) {
              Alert.alert('خطا', error instanceof Error ? error.message : 'حذف انجام نشد');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <ScreenHeader title="داشبورد" subtitle={formatTodayLabel()} />
        <RangeTabs value={range} onChange={handleRangeChange} />
      </View>

      <FlatList
        ref={listRef}
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TransactionRow transaction={item} onEdit={handleEdit} onDelete={handleDelete} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <BalanceHero
              summary={summary}
              rangeLabel={rangeLabel}
              caption={getRangeCaption(range)}
            />
            <SectionHeader
              title="تراکنش‌ها"
              actionLabel={loaded ? `${toPersianDigits(transactions.length)} مورد` : undefined}
            />
          </View>
        }
        ListEmptyComponent={
          loaded ? (
            <EmptyState
              icon="receipt-outline"
              title="در این بازه تراکنشی ثبت نشده"
              message="با دکمه‌ی + یک درآمد یا هزینه‌ی جدید ثبت کن."
              actionLabel="ثبت تراکنش"
              onActionPress={() => router.navigate('/add')}
            />
          ) : (
            <View style={styles.loadingSpace} />
          )
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="ثبت تراکنش جدید"
        onPress={() => router.navigate('/add')}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
        <Ionicons name="add" size={30} color={colors.white} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 110,
  },
  listHeader: {
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  separator: {
    height: spacing.sm,
  },
  loadingSpace: {
    height: 120,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  fabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
});
