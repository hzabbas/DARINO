import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { CategoryBreakdownRow } from '../../components/CategoryBreakdownRow';
import { CategoryTransactionsSheet } from '../../components/CategoryTransactionsSheet';
import { EmptyState } from '../../components/EmptyState';
import { FinancialRatioCard } from '../../components/FinancialRatioCard';
import { MonthPickerSheet } from '../../components/MonthPickerSheet';
import { RangeTabs } from '../../components/RangeTabs';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBox } from '../../components/SearchBox';
import { SectionHeader } from '../../components/SectionHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TransactionRow } from '../../components/TransactionRow';
import { getCategoryTotals, getSummary, listTransactions } from '../../db/transactions';
import { useDbQuery } from '../../hooks/useDbQuery';
import { colors, radius, spacing } from '../../theme';
import type { CategoryTotal, MonthlySummary, TransactionType } from '../../types/models';
import { toPersianDigits } from '../../utils/digits';
import {
  formatJalaliMonthLabel,
  getReportBounds,
  getReportCaption,
  type ReportRange,
  type ReportRangeTab,
} from '../../utils/reportRange';
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

export default function ReportsScreen() {
  const [rangeKind, setRangeKind] = useState<ReportRangeTab>('month');
  const [customMonth, setCustomMonth] = useState<{ jy: number; jm: number } | null>(null);
  const [isMonthPickerOpen, setMonthPickerOpen] = useState(false);
  const [breakdownType, setBreakdownType] = useState<TransactionType>('expense');
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryTotal | null>(null);

  const range: ReportRange =
    rangeKind === 'custom' && customMonth
      ? { kind: 'custom-month', jy: customMonth.jy, jm: customMonth.jm }
      : { kind: rangeKind === 'custom' ? 'month' : rangeKind };

  const { data } = useDbQuery(
    (db) => {
      const bounds = getReportBounds(range);
      return {
        summary: getSummary(db, bounds),
        transactions: listTransactions(db, bounds),
        expenseTotals: getCategoryTotals(db, bounds, 'expense'),
        incomeTotals: getCategoryTotals(db, bounds, 'income'),
      };
    },
    [rangeKind, customMonth?.jy, customMonth?.jm],
  );

  const summary = data?.summary ?? EMPTY_SUMMARY;
  const transactions = data?.transactions ?? [];
  const breakdown =
    breakdownType === 'expense' ? (data?.expenseTotals ?? []) : (data?.incomeTotals ?? []);
  const breakdownTotal = breakdownType === 'expense' ? summary.expense : summary.income;
  const filteredTransactions = transactions.filter((transaction) =>
    matchesTransactionQuery(transaction, query),
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

  return (
    <Screen>
      <ScreenHeader title="گزارش و تحلیل" subtitle={getReportCaption(range)} />

      <RangeTabs value={rangeKind} options={rangeOptions} onChange={handleRangeChange} />

      <FinancialRatioCard summary={summary} />

      {transactions.length === 0 ? (
        <EmptyState
          icon="pie-chart-outline"
          title="در این بازه تراکنشی نیست"
          message="با ثبت درآمد و هزینه، گزارش‌های این بازه ساخته می‌شود."
        />
      ) : (
        <>
          <SectionHeader title="به تفکیک دسته‌بندی" />

          <SegmentedControl
            value={breakdownType}
            options={BREAKDOWN_OPTIONS}
            onChange={setBreakdownType}
          />

          {breakdown.length === 0 ? (
            <Card>
              <AppText variant="caption" style={styles.emptyText}>
                {breakdownType === 'expense'
                  ? 'در این بازه هزینه‌ای ثبت نشده است.'
                  : 'در این بازه درآمدی ثبت نشده است.'}
              </AppText>
            </Card>
          ) : (
            <Card style={styles.breakdownCard}>
              {breakdown.map((item, index) => (
                <CategoryBreakdownRow
                  key={`${item.category_id ?? 'none'}-${index}`}
                  item={item}
                  total={breakdownTotal}
                  last={index === breakdown.length - 1}
                  onPress={
                    item.category_id != null ? () => setSelectedCategory(item) : undefined
                  }
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
              <AppText variant="caption" style={styles.emptyText}>
                چیزی با این جستجو پیدا نشد.
              </AppText>
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

const styles = StyleSheet.create({
  breakdownCard: {
    padding: 0,
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  historyList: {
    gap: spacing.sm,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
});
