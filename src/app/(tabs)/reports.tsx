import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { CategoryBreakdownRow } from '../../components/CategoryBreakdownRow';
import { CategoryTransactionsSheet } from '../../components/CategoryTransactionsSheet';
import { EmptyHint } from '../../components/EmptyHint';
import { EmptyState } from '../../components/EmptyState';
import { FinancialChart } from '../../components/FinancialChart';
import { FinancialRatioCard } from '../../components/FinancialRatioCard';
import { GoalProgressCard } from '../../components/GoalProgressCard';
import { MonthPickerSheet } from '../../components/MonthPickerSheet';
import { RangeTabs } from '../../components/RangeTabs';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBox } from '../../components/SearchBox';
import { SectionHeader } from '../../components/SectionHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { SmartStatsCard } from '../../components/SmartStatsCard';
import { TransactionRow } from '../../components/TransactionRow';
import { getNumericSetting, getSetting, setSetting } from '../../db/settings';
import { getBankBalanceBreakdown } from '../../db/bankAccounts';
import {
  INCLUDE_BANK_BALANCE_IN_INCOME_KEY,
  sumOpeningBalanceIncomes,
} from '../../features/balanceIncome';
import { getCategoryTotals, getSummary, listTransactions } from '../../db/transactions';
import { useDbQuery } from '../../hooks/useDbQuery';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import type { CategoryTotal, MonthlySummary, TransactionType } from '../../types/models';
import { buildDailySeries, buildMonthlySeries, combineSummaryWithBankBalance, computeSmartStats } from '../../utils/analytics';
import { toPersianDigits } from '../../utils/digits';
import { notify } from '../../utils/dialogs';
import { getJalaliMonthRange, toLocalIso } from '../../utils/jalali';
import {
  formatJalaliMonthLabel,
  getReportBounds,
  getReportCaption,
  type ReportRange,
  type ReportRangeTab,
} from '../../utils/reportRange';
import { buildReportText } from '../../utils/reportText';
import { shareText } from '../../utils/share';
import { matchesTransactionQuery } from '../../utils/transactionSearch';

const EMPTY_SUMMARY: MonthlySummary = { income: 0, expense: 0, balance: 0 };

const BREAKDOWN_OPTIONS = [
  {
    value: 'expense' as TransactionType,
    label: 'هزینه‌ها',
    icon: 'arrow-up-circle-outline' as const,
  },
  {
    value: 'income' as TransactionType,
    label: 'درآمدها',
    icon: 'arrow-down-circle-outline' as const,
  },
];

/** ابتدای n ماه شمسی قبل، به‌صورت ISO محلی */
function monthsBackStartIso(count: number): string {
  const current = getJalaliMonthRange(new Date());
  let jy = current.jy;
  let jm = current.jm - (count - 1);
  while (jm <= 0) {
    jm += 12;
    jy -= 1;
  }
  return getJalaliMonthRange(jy, jm).startIso;
}

export default function ReportsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [rangeKind, setRangeKind] = useState<ReportRangeTab>('month');
  const [customMonth, setCustomMonth] = useState<{ jy: number; jm: number } | null>(null);
  const [isMonthPickerOpen, setMonthPickerOpen] = useState(false);
  const [breakdownType, setBreakdownType] = useState<TransactionType>('expense');
  const [chartMode, setChartMode] = useState<'daily' | 'monthly'>('daily');
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryTotal | null>(null);

  const range: ReportRange =
    rangeKind === 'custom' && customMonth
      ? { kind: 'custom-month', jy: customMonth.jy, jm: customMonth.jm }
      : { kind: rangeKind === 'custom' ? 'month' : rangeKind };

  const { data, reload } = useDbQuery(
    (db) => {
      const bounds = getReportBounds(range);
      const monthRange = getJalaliMonthRange(new Date());
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      weekAgo.setHours(0, 0, 0, 0);

      return {
        summary: getSummary(db, bounds),
        bankBreakdown: getBankBalanceBreakdown(db, true),
        openingIncome: sumOpeningBalanceIncomes(db, bounds),
        includeBankBalance: getSetting(db, INCLUDE_BANK_BALANCE_IN_INCOME_KEY) === '1',
        transactions: listTransactions(db, bounds),
        expenseTotals: getCategoryTotals(db, bounds, 'expense'),
        incomeTotals: getCategoryTotals(db, bounds, 'income'),
        monthlyRows: listTransactions(db, {
          startIso: monthsBackStartIso(6),
          endIso: monthRange.endIso,
        }),
        dailyRows: listTransactions(db, {
          startIso: toLocalIso(weekAgo),
          endIso: toLocalIso(new Date()),
        }),
        monthSummary: getSummary(db, { startIso: monthRange.startIso, endIso: monthRange.endIso }),
        incomeGoal: getNumericSetting(db, 'income_goal'),
        expenseBudget: getNumericSetting(db, 'expense_budget'),
      };
    },
    [rangeKind, customMonth?.jy, customMonth?.jm],
  );

  const rawSummary = data?.summary ?? EMPTY_SUMMARY;
  const includeBankBalance = data?.includeBankBalance ?? false;
  const summary = combineSummaryWithBankBalance(rawSummary, {
    include: includeBankBalance,
    openingIncomeInRange: data?.openingIncome ?? 0,
    baseBankBalance: data?.bankBreakdown.totalBaseBankBalance ?? 0,
  });
  const transactions = data?.transactions ?? [];
  const breakdown =
    breakdownType === 'expense' ? (data?.expenseTotals ?? []) : (data?.incomeTotals ?? []);
  const breakdownTotal = breakdownType === 'expense' ? summary.expense : summary.income;

  // با useMemo: جستجو نباید در هر رندر صفحه (تغییر تب بازه، تغییر نوع تفکیک) کل
  // تاریخچه را دوباره فیلتر کند.
  const filteredTransactions = useMemo(
    () => transactions.filter((transaction) => matchesTransactionQuery(transaction, query)),
    [transactions, query],
  );

  // پایدار نگه‌داشتن کال‌بک، شرط اثر `memo` روی ردیف‌های تفکیک دسته‌بندی است
  const handleSelectCategory = useCallback((item: CategoryTotal) => {
    setSelectedCategory(item);
  }, []);

  const chartPoints = useMemo(() => {
    if (chartMode === 'monthly') {
      return buildMonthlySeries(data?.monthlyRows ?? [], new Date(), 6);
    }
    return buildDailySeries(data?.dailyRows ?? [], new Date(), 7);
  }, [chartMode, data?.monthlyRows, data?.dailyRows]);

  const stats = useMemo(
    () => computeSmartStats(transactions, getReportBounds(range)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, rangeKind, customMonth?.jy, customMonth?.jm],
  );

  const rangeOptions: { value: ReportRangeTab; label: string }[] = [
    { value: 'today', label: 'امروز' },
    { value: 'week', label: 'این هفته' },
    { value: 'month', label: 'این ماه' },
    {
      value: 'custom',
      label: customMonth ? formatJalaliMonthLabel(customMonth.jy, customMonth.jm) : 'ماه دیگر…',
    },
  ];

  const handleRangeChange = (next: ReportRangeTab) => {
    if (next === 'custom') {
      setMonthPickerOpen(true);
      return;
    }
    setRangeKind(next);
  };

  const handleSelectMonth = (jy: number, jm: number) => {
    setCustomMonth({ jy, jm });
    setRangeKind('custom');
  };

  const handleShare = async () => {
    const text = buildReportText({
      rangeLabel: getReportCaption(range),
      summary,
      expenseBreakdown: data?.expenseTotals ?? [],
    });
    const result = await shareText('گزارش دارینو', text);
    if (result === 'copied') {
      notify('کپی شد', 'متن گزارش در کلیپ‌بورد کپی شد و آماده‌ی ارسال است.');
    } else if (result === 'failed') {
      notify('اشتراک‌گذاری انجام نشد', 'اشتراک‌گذاری متن در این دستگاه ممکن نبود.');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="گزارش و تحلیل"
        subtitle={getReportCaption(range)}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="اشتراک‌گذاری گزارش متنی"
            hitSlop={6}
            onPress={handleShare}
            style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
            <Ionicons name="share-social-outline" size={18} color={colors.primary} />
          </Pressable>
        }
      />

      <RangeTabs value={rangeKind} options={rangeOptions} onChange={handleRangeChange} />

      <FinancialRatioCard summary={summary} />

      <GoalProgressCard
        income={data?.monthSummary?.income ?? 0}
        expense={data?.monthSummary?.expense ?? 0}
        incomeGoal={data?.incomeGoal ?? 0}
        expenseBudget={data?.expenseBudget ?? 0}
      />

      <View style={styles.chartHeader}>
        <AppText variant="subtitle">نمودار دوره</AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => setChartMode((current) => (current === 'daily' ? 'monthly' : 'daily'))}
          style={styles.chartToggle}>
          <Ionicons
            name={chartMode === 'daily' ? 'calendar-outline' : 'stats-chart-outline'}
            size={13}
            color={colors.primary}
          />
          <AppText variant="caption" style={styles.chartToggleText}>
            {chartMode === 'daily' ? '۷ روز اخیر' : '۶ ماه اخیر'}
          </AppText>
        </Pressable>
      </View>

      <FinancialChart
        points={chartPoints}
        caption={
          chartMode === 'daily'
            ? 'درآمد و هزینه‌ی هفت روز گذشته'
            : 'روند درآمد و هزینه در شش ماه شمسی گذشته'
        }
      />

      {transactions.length === 0 ? (
        <EmptyState
          icon="pie-chart-outline"
          title="در این بازه تراکنشی نیست"
          message="با ثبت درآمد و هزینه، گزارش‌های این بازه ساخته می‌شود."
        />
      ) : (
        <>
          <SmartStatsCard stats={stats} />

          <SectionHeader title="به تفکیک دسته‌بندی" />

          <SegmentedControl
            value={breakdownType}
            options={BREAKDOWN_OPTIONS}
            onChange={setBreakdownType}
          />

          {breakdown.length === 0 ? (
            <Card>
              <EmptyHint
                icon="pie-chart-outline"
                text={
                  breakdownType === 'expense'
                    ? 'در این بازه هزینه‌ای ثبت نشده است.'
                    : 'در این بازه درآمدی ثبت نشده است.'
                }
              />
            </Card>
          ) : (
            <Card style={styles.breakdownCard}>
              {breakdown.map((item, index) => (
                <CategoryBreakdownRow
                  key={`${item.category_id ?? 'none'}-${index}`}
                  item={item}
                  total={breakdownTotal}
                  last={index === breakdown.length - 1}
                  onSelect={item.category_id != null ? handleSelectCategory : undefined}
                />
              ))}
            </Card>
          )}

          <SectionHeader
            title="تاریخچه تراکنش‌ها"
            actionLabel={`${toPersianDigits(filteredTransactions.length)} مورد`}
          />

          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="جستجو در دسته، توضیحات یا مبلغ…"
          />

          {filteredTransactions.length === 0 ? (
            <Card>
              <EmptyHint icon="search-outline" text="چیزی با این جستجو پیدا نشد." />
            </Card>
          ) : (
            <View style={styles.historyList}>
              {filteredTransactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </View>
          )}
        </>
      )}

      <MonthPickerSheet
        visible={isMonthPickerOpen}
        selectedMonth={customMonth}
        onClose={() => setMonthPickerOpen(false)}
        onSelect={handleSelectMonth}
      />

      <CategoryTransactionsSheet
        visible={selectedCategory !== null}
        category={selectedCategory}
        transactions={transactions}
        onClose={() => setSelectedCategory(null)}
      />
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    shareButton: {
      width: 36,
      height: 36,
      borderRadius: radius.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    pressed: {
      opacity: 0.7,
    },
    chartHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    chartToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
    },
    chartToggleText: {
      color: colors.primary,
    },
    breakdownCard: {
      padding: 0,
      overflow: 'hidden',
      borderRadius: radius.lg,
    },
    historyList: {
      gap: spacing.sm,
    },
  });
