import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { BalanceHero } from '../../components/BalanceHero';
import { PendingSmsGateModal } from '../../components/PendingSmsGateModal';
import { EmptyState } from '../../components/EmptyState';
import { GoalProgressCard } from '../../components/GoalProgressCard';
import { RangeTabs } from '../../components/RangeTabs';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ThemeToggle } from '../../components/ThemeToggle';
import { TransactionRow } from '../../components/TransactionRow';
import { listBankAccounts, totalBankBalance } from '../../db/bankAccounts';
import { listCategories } from '../../db/categories';
import { useDatabase } from '../../db/DatabaseProvider';
import { listPendingSms } from '../../db/pendingSms';
import { getNumericSetting } from '../../db/settings';
import { deleteTransaction, getSummary, listTransactions } from '../../db/transactions';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useSmsSync } from '../../features/useSmsSync';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import type { MonthlySummary, TransactionType, TransactionWithCategory } from '../../types/models';
import { formatAmount, formatToman } from '../../utils/currency';
import { toPersianDigits } from '../../utils/digits';
import { confirmAction, notify } from '../../utils/dialogs';
import { toPersianErrorMessage } from '../../utils/errors';
import { formatTodayLabel, getJalaliMonthRange } from '../../utils/jalali';
import {
  DASHBOARD_RANGES,
  getRangeBounds,
  getRangeCaption,
  type DashboardRange,
} from '../../utils/ranges';

const EMPTY_SUMMARY: MonthlySummary = { income: 0, expense: 0, balance: 0 };

type TypeFilter = 'all' | TransactionType;
type SortMode = 'newest' | 'highest' | 'lowest';

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'همه' },
  { value: 'income', label: 'درآمدها' },
  { value: 'expense', label: 'هزینه‌ها' },
];

const SORT_MODES: { value: SortMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'newest', label: 'جدیدترین', icon: 'time-outline' },
  { value: 'highest', label: 'بیشترین مبلغ', icon: 'arrow-down-outline' },
  { value: 'lowest', label: 'کمترین مبلغ', icon: 'arrow-up-outline' },
];

export default function DashboardScreen() {
  const database = useDatabase();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const listRef = useRef<FlatList<TransactionWithCategory>>(null);

  const [range, setRange] = useState<DashboardRange>('month');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [gateSkipped, setGateSkipped] = useState(false);

  useSmsSync();

  const { data, reload } = useDbQuery(
    (db) => {
      const bounds = getRangeBounds(range);
      const monthRange = getJalaliMonthRange(new Date());
      return {
        summary: getSummary(db, bounds),
        monthSummary: getSummary(db, { startIso: monthRange.startIso, endIso: monthRange.endIso }),
        transactions: listTransactions(db, bounds),
        incomeGoal: getNumericSetting(db, 'income_goal'),
        expenseBudget: getNumericSetting(db, 'expense_budget'),
        accounts: listBankAccounts(db, true),
        totalBalance: totalBankBalance(db),
        pendingSms: listPendingSms(db),
        categories: listCategories(db),
      };
    },
    [range],
  );

  const summary = data?.summary ?? EMPTY_SUMMARY;
  const monthSummary = data?.monthSummary ?? EMPTY_SUMMARY;
  const transactions = data?.transactions ?? [];
  const accounts = data?.accounts ?? [];
  const totalBalance = data?.totalBalance ?? 0;
  const pendingSms = data?.pendingSms ?? [];
  const rangeLabel = DASHBOARD_RANGES.find((option) => option.value === range)?.label ?? '';

  const visibleTransactions = useMemo(() => {
    const filtered =
      typeFilter === 'all'
        ? transactions
        : transactions.filter((transaction) => transaction.type === typeFilter);

    if (sortMode === 'newest') {
      return filtered;
    }
    if (sortMode === 'highest') {
      return [...filtered].sort((first, second) => second.amount - first.amount);
    }
    return [...filtered].sort((first, second) => first.amount - second.amount);
  }, [transactions, typeFilter, sortMode]);

  const sortOption = SORT_MODES.find((option) => option.value === sortMode) ?? SORT_MODES[0];

  const handleRangeChange = (nextRange: DashboardRange) => {
    setRange(nextRange);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const cycleSort = () => {
    const index = SORT_MODES.findIndex((option) => option.value === sortMode);
    setSortMode(SORT_MODES[(index + 1) % SORT_MODES.length].value);
  };

  const handleEdit = useCallback((transaction: TransactionWithCategory) => {
    router.push(`/edit/${transaction.id}`);
  }, []);

  const handleDelete = useCallback(
    (transaction: TransactionWithCategory) => {
      const title = transaction.category_name ?? 'این تراکنش';
      confirmAction({
        title: 'حذف تراکنش',
        message: `${title} به مبلغ ${formatToman(transaction.amount)} حذف شود؟ این کار قابل بازگشت نیست.`,
        confirmLabel: 'حذف',
        destructive: true,
        onConfirm: () => {
          try {
            deleteTransaction(database, transaction.id);
            reload();
          } catch (error) {
            notify('خطا', toPersianErrorMessage(error, 'حذف انجام نشد'));
          }
        },
      });
    },
    [database, reload],
  );

  // ردیف‌ها memo شده‌اند؛ پس renderItem و جداکننده هم باید پایدار بمانند وگرنه
  // هر رندر داشبورد همه‌ی ردیف‌ها را دوباره می‌سازد.
  const renderTransaction = useCallback(
    ({ item }: { item: TransactionWithCategory }) => (
      <TransactionRow transaction={item} onEdit={handleEdit} onDelete={handleDelete} />
    ),
    [handleDelete, handleEdit],
  );

  const renderSeparator = useCallback(() => <View style={styles.separator} />, [styles]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <ScreenHeader
          title="داشبورد"
          subtitle={formatTodayLabel()}
          right={
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="حساب‌های بانکی"
                hitSlop={6}
                onPress={() => router.push('/banks')}
                style={styles.settingsButton}>
                <Ionicons name="card-outline" size={19} color={colors.textMuted} />
              </Pressable>
              <ThemeToggle />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="تنظیمات"
                hitSlop={6}
                onPress={() => router.push('/settings')}
                style={styles.settingsButton}>
                <Ionicons name="settings-outline" size={19} color={colors.textMuted} />
              </Pressable>
            </View>
          }
        />
        <RangeTabs value={range} options={DASHBOARD_RANGES} onChange={handleRangeChange} />
      </View>

      <FlatList
        ref={listRef}
        data={visibleTransactions}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTransaction}
        ItemSeparatorComponent={renderSeparator}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        // رندر تدریجی برای تاریخچه‌ی بزرگ: فقط چند ردیف اول ساخته می‌شود و بقیه
        // هنگام اسکرول. `removeClippedSubviews` روی اندروید پیش‌فرض است و برای
        // iOS (که با انیمیشن scale مشکل‌ساز می‌شود) روشن نمی‌شود.
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={11}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <BalanceHero
              summary={summary}
              rangeLabel={rangeLabel}
              caption={getRangeCaption(range)}
            />

            {accounts.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/banks')}
                style={styles.bankSummary}>
                <View style={styles.bankSummaryIcon}>
                  <Ionicons name="wallet-outline" size={17} color={colors.primary} />
                </View>
                <View style={styles.bankSummaryTexts}>
                  <AppText variant="caption" style={styles.bankSummaryLabel}>
                    موجودی کل حساب‌های بانکی
                  </AppText>
                  <AppText variant="amountSmall">{`${formatAmount(totalBalance)} تومان`}</AppText>
                </View>
                <AppText variant="caption" style={styles.bankSummaryLabel}>
                  {`${toPersianDigits(accounts.length)} حساب`}
                </AppText>
                <Ionicons name="chevron-back" size={16} color={colors.textFaint} />
              </Pressable>
            ) : null}

            <GoalProgressCard
              income={monthSummary.income}
              expense={monthSummary.expense}
              incomeGoal={data?.incomeGoal ?? 0}
              expenseBudget={data?.expenseBudget ?? 0}
            />

            <View style={styles.filters}>
              <View style={styles.filterChips}>
                {TYPE_FILTERS.map((option) => {
                  const active = option.value === typeFilter;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setTypeFilter(option.value)}
                      style={[styles.filterChip, active && styles.filterChipActive]}>
                      <AppText
                        variant="caption"
                        style={[styles.filterText, active && styles.filterTextActive]}>
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`مرتب‌سازی: ${sortOption.label}`}
                onPress={cycleSort}
                style={styles.sortChip}>
                <Ionicons name={sortOption.icon} size={13} color={colors.textMuted} />
                <AppText variant="caption" style={styles.sortText}>
                  {sortOption.label}
                </AppText>
              </Pressable>
            </View>

            {pendingSms.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setGateSkipped(false)}
                style={styles.pendingBanner}>
                <Ionicons name="mail-unread-outline" size={16} color={colors.warning} />
                <AppText variant="caption" style={styles.pendingBannerText}>
                  {`${toPersianDigits(pendingSms.length)} تراکنش از پیامک منتظر تایید است`}
                </AppText>
                <Ionicons name="chevron-back" size={14} color={colors.warning} />
              </Pressable>
            ) : null}

            <View style={styles.listTitleRow}>
              <AppText variant="subtitle">تراکنش‌ها</AppText>
              <AppText variant="caption" style={styles.countText}>
                {`${toPersianDigits(visibleTransactions.length)} مورد`}
              </AppText>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title={transactions.length > 0 ? 'با این فیلتر چیزی نیست' : 'در این بازه تراکنشی ثبت نشده'}
            message={
              transactions.length > 0
                ? 'فیلتر نوع تراکنش را عوض کن یا «همه» را انتخاب کن.'
                : 'با دکمه‌ی + یک درآمد یا هزینه‌ی جدید ثبت کن.'
            }
            actionLabel={transactions.length > 0 ? undefined : 'ثبت تراکنش'}
            onActionPress={transactions.length > 0 ? undefined : () => router.navigate('/add')}
          />
        }
      />

      <PendingSmsGateModal
        visible={pendingSms.length > 0 && !gateSkipped}
        items={pendingSms}
        accounts={accounts}
        categories={data?.categories ?? []}
        onClose={() => setGateSkipped(true)}
        onChanged={reload}
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

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    settingsButton: {
      width: 36,
      height: 36,
      borderRadius: radius.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
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
    bankSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    bankSummaryIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    bankSummaryTexts: { flex: 1, gap: 1 },
    bankSummaryLabel: { color: colors.textMuted },
    pendingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.warningSoft,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    pendingBannerText: { flex: 1, color: colors.warning },
    filters: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    filterChips: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    filterChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
    },
    filterChipActive: {
      backgroundColor: colors.primarySoft,
    },
    filterText: {
      color: colors.textMuted,
    },
    filterTextActive: {
      color: colors.primary,
    },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    sortText: {
      color: colors.textMuted,
    },
    listTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    countText: {
      color: colors.textFaint,
    },
    separator: {
      height: spacing.sm,
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
