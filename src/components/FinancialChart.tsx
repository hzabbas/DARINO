import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { pickAxisLabelIndices, type SeriesPoint } from '../utils/analytics';
import { formatShortAmount } from '../utils/currency';
import { AppText } from './AppText';

interface FinancialChartProps {
  points: SeriesPoint[];
  /** برای توضیح زیر نمودار */
  caption?: string;
}

const CHART_HEIGHT = 132;

/**
 * نمودار میله‌ای دوتایی درآمد/هزینه؛ بدون کتابخانه‌ی خارجی.
 * ارتفاع هر میله نسبت به بزرگ‌ترین مقدار دوره محاسبه می‌شود.
 *
 * با `memo` بسته شده تا تغییر سایر بخش‌های صفحه‌ی گزارش، محاسبه و رندر نمودار را
 * دوباره تکرار نکند (`points` در والد با `useMemo` پایدار می‌ماند).
 */
function FinancialChartComponent({ points, caption }: FinancialChartProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const max = points.reduce((value, point) => Math.max(value, point.income, point.expense), 0);
  const totalIncome = points.reduce((sum, point) => sum + point.income, 0);
  const totalExpense = points.reduce((sum, point) => sum + point.expense, 0);
  const visibleIndices = useMemo(
    () => new Set(pickAxisLabelIndices(points.length, 6)),
    [points.length],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText variant="subtitle">روند مالی</AppText>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.income }]} />
            <AppText variant="caption" style={styles.legendText}>
              درآمد
            </AppText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.expense }]} />
            <AppText variant="caption" style={styles.legendText}>
              هزینه
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.chart}>
        {points.map((point, index) => {
          const incomeHeight = max > 0 ? Math.max(3, (point.income / max) * CHART_HEIGHT) : 3;
          const expenseHeight = max > 0 ? Math.max(3, (point.expense / max) * CHART_HEIGHT) : 3;
          const showLabel = visibleIndices.has(index);

          return (
            <View key={point.key} style={styles.column}>
              <View style={styles.bars}>
                <View style={[styles.bar, { height: incomeHeight, backgroundColor: colors.income }]} />
                <View style={[styles.bar, { height: expenseHeight, backgroundColor: colors.expense }]} />
              </View>
              <AppText variant="caption" style={styles.label} numberOfLines={1}>
                {showLabel ? point.label : ' '}
              </AppText>
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <AppText
          variant="caption"
          style={styles.footerText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {`درآمد: ${formatShortAmount(totalIncome)}`}
        </AppText>
        <AppText
          variant="caption"
          style={styles.footerText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {`هزینه: ${formatShortAmount(totalExpense)}`}
        </AppText>
      </View>

      {caption ? (
        <AppText variant="caption" style={styles.caption}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

export const FinancialChart = memo(FinancialChartComponent);

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    legend: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      color: colors.textMuted,
    },
    chart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: CHART_HEIGHT + 26,
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    column: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.xs,
    },
    bars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3,
      height: CHART_HEIGHT,
    },
    bar: {
      width: 9,
      borderRadius: 4,
      minHeight: 3,
    },
    label: {
      color: colors.textFaint,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: spacing.sm,
    },
    footerText: {
      color: colors.textMuted,
    },
    caption: {
      color: colors.textFaint,
    },
  });
