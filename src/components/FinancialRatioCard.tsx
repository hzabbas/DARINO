import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';
import type { MonthlySummary } from '../types/models';
import { formatAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { AppText } from './AppText';
import { Card } from './Card';

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="amountSmall" style={{ color }} numberOfLines={1} adjustsFontSizeToFit>
        {formatAmount(value)}
      </AppText>
    </View>
  );
}

/**
 * کارت وضعیت مالی + نسبت هزینه به درآمد:
 * چند درصد از درآمد صرف هزینه شده و چه مقدار سود باقی مانده است.
 */
export function FinancialRatioCard({ summary }: { summary: MonthlySummary }) {
  const hasIncome = summary.income > 0;
  const spentPercent = hasIncome ? Math.round((summary.expense / summary.income) * 100) : 0;
  const netPercent = hasIncome ? 100 - spentPercent : 0;
  const isLoss = hasIncome && netPercent < 0;
  const clampedSpent = Math.min(Math.max(spentPercent, 0), 100);

  return (
    <Card style={styles.card}>
      <View style={styles.statsRow}>
        <StatItem label="درآمد" value={summary.income} color={colors.income} />
        <View style={styles.verticalDivider} />
        <StatItem label="هزینه" value={summary.expense} color={colors.expense} />
        <View style={styles.verticalDivider} />
        <StatItem
          label="مانده"
          value={summary.balance}
          color={summary.balance < 0 ? colors.expense : colors.primary}
        />
      </View>

      <View style={styles.divider} />

      <AppText variant="subtitle">نسبت هزینه به درآمد</AppText>

      {hasIncome ? (
        <>
          <View style={styles.ratioRow}>
            <View style={styles.ratioItem}>
              <AppText variant="amount" style={[styles.percent, { color: colors.expense }]}>
                {`${toPersianDigits(spentPercent)}٪`}
              </AppText>
              <AppText variant="caption">صرف هزینه</AppText>
            </View>

            <View style={styles.ratioItem}>
              <AppText
                variant="amount"
                style={[styles.percent, { color: isLoss ? colors.expense : colors.income }]}>
                {`${toPersianDigits(netPercent)}٪`}
              </AppText>
              <AppText variant="caption">{isLoss ? 'زیان خالص' : 'سود خالص'}</AppText>
            </View>
          </View>

          <View style={styles.track}>
            <View style={[styles.spentBar, { width: `${clampedSpent}%` }]} />
            <View style={styles.remainingBar} />
          </View>

          <AppText variant="caption" style={styles.hint}>
            {spentPercent > 100
              ? `هزینه‌ها ${toPersianDigits(spentPercent)}٪ درآمد این بازه است؛ بازه با زیان بسته شده.`
              : `از هر ۱۰۰ تومان درآمد، ${toPersianDigits(
                  spentPercent,
                )} تومان خرج شده و ${toPersianDigits(netPercent)} تومان مانده است.`}
          </AppText>
        </>
      ) : (
        <AppText variant="caption" style={styles.hint}>
          در این بازه درآمدی ثبت نشده است؛ برای محاسبه‌ی نسبت، ابتدا درآمد ثبت کن.
        </AppText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  verticalDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratioItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  percent: {
    fontSize: 24,
    lineHeight: 36,
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  spentBar: {
    height: '100%',
    backgroundColor: colors.expense,
  },
  remainingBar: {
    flex: 1,
    height: '100%',
    backgroundColor: colors.income,
  },
  hint: {
    color: colors.textMuted,
    lineHeight: 20,
  },
});
