import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { CategoryIcon } from '../../components/CategoryIcon';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { getExpenseByCategory, getMonthlySummary } from '../../db/transactions';
import { useDbQuery } from '../../hooks/useDbQuery';
import { colors, radius, spacing } from '../../theme';
import type { MonthlySummary } from '../../types/models';
import { formatAmount } from '../../utils/currency';
import { toPersianDigits } from '../../utils/digits';
import { getJalaliMonthRange } from '../../utils/jalali';

const EMPTY_SUMMARY: MonthlySummary = { income: 0, expense: 0, balance: 0 };

export default function ReportsScreen() {
  const { data } = useDbQuery((db) => {
    const range = getJalaliMonthRange();
    return {
      range,
      summary: getMonthlySummary(db, range.startIso, range.endIso),
      breakdown: getExpenseByCategory(db, range.startIso, range.endIso),
    };
  });

  const range = data?.range ?? getJalaliMonthRange();
  const summary = data?.summary ?? EMPTY_SUMMARY;
  const breakdown = data?.breakdown ?? [];

  return (
    <Screen>
      <ScreenHeader title="گزارش و تحلیل" subtitle={`خلاصه‌ی ${range.label}`} />

      <Card style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <AppText variant="caption">درآمد</AppText>
          <AppText variant="amountSmall" style={{ color: colors.income }}>
            {formatAmount(summary.income)}
          </AppText>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <AppText variant="caption">هزینه</AppText>
          <AppText variant="amountSmall" style={{ color: colors.expense }}>
            {formatAmount(summary.expense)}
          </AppText>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <AppText variant="caption">مانده</AppText>
          <AppText
            variant="amountSmall"
            style={{ color: summary.balance < 0 ? colors.expense : colors.primary }}>
            {formatAmount(summary.balance)}
          </AppText>
        </View>
      </Card>

      <SectionHeader title="هزینه‌ها به تفکیک دسته‌بندی" />

      {breakdown.length === 0 ? (
        <EmptyState
          icon="pie-chart-outline"
          title="هنوز هزینه‌ای ثبت نشده"
          message="بعد از ثبت اولین هزینه‌ی این ماه، سهم هر دسته‌بندی اینجا نمایش داده می‌شود."
        />
      ) : (
        <Card style={styles.breakdownCard}>
          {breakdown.map((item, index) => {
            const share =
              summary.expense > 0 ? Math.round((item.total / summary.expense) * 100) : 0;
            return (
              <View
                key={`${item.category_id ?? 'none'}-${index}`}
                style={[
                  styles.breakdownRow,
                  index < breakdown.length - 1 && styles.breakdownSeparator,
                ]}>
                <View style={styles.breakdownTop}>
                  <CategoryIcon icon={item.icon} color={item.color} size={36} />
                  <View style={styles.breakdownText}>
                    <AppText variant="label" numberOfLines={1}>
                      {item.name}
                    </AppText>
                    <AppText variant="caption" style={styles.breakdownMeta}>
                      {toPersianDigits(item.count)} تراکنش
                    </AppText>
                  </View>
                  <View style={styles.breakdownAmount}>
                    <AppText variant="amountSmall">{formatAmount(item.total)}</AppText>
                    <AppText variant="caption" style={styles.breakdownMeta}>
                      {toPersianDigits(share)}٪
                    </AppText>
                  </View>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(share, 2)}%`,
                        backgroundColor: item.color,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <AppText variant="caption" style={styles.footerNote}>
        تحلیل‌های بیشتر مثل روند ماهانه و مقایسه با ماه قبل در گام‌های بعدی اضافه می‌شود.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  breakdownCard: {
    padding: 0,
    overflow: 'hidden',
  },
  breakdownRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  breakdownSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  breakdownTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  breakdownText: {
    flex: 1,
    gap: 2,
  },
  breakdownAmount: {
    alignItems: 'flex-start',
    gap: 2,
  },
  breakdownMeta: {
    color: colors.textFaint,
  },
  barTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  footerNote: {
    textAlign: 'center',
    color: colors.textFaint,
  },
});
