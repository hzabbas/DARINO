import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import type { MonthlySummary } from '../types/models';
import { formatAmount, formatSignedAmount } from '../utils/currency';
import { AppText } from './AppText';

interface BalanceHeroProps {
  summary: MonthlySummary;
  /** نام بازه، مثل «این ماه» */
  rangeLabel: string;
  /** بازه‌ی دقیق، مثل «آبان ۱۴۰۵» */
  caption: string;
}

function StatColumn({
  icon,
  color,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <View style={styles.statTexts}>
        <AppText variant="caption" style={styles.statLabel}>
          {label}
        </AppText>
        <AppText
          variant="amountSmall"
          style={[styles.statValue, { color }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatAmount(value)}
        </AppText>
      </View>
    </View>
  );
}

/** کارت برجسته‌ی وضعیت مالی: سود خالص، جمع درآمد و جمع هزینه. */
export function BalanceHero({ summary, rangeLabel, caption }: BalanceHeroProps) {
  const positive = summary.balance > 0;
  const negative = summary.balance < 0;
  const tone = positive ? colors.heroPositive : negative ? colors.heroNegative : colors.white;

  return (
    <View style={styles.card}>
      <View style={styles.glow} />

      <View style={styles.topRow}>
        <AppText variant="caption" style={styles.label}>
          سود خالص
        </AppText>
        <View style={styles.badge}>
          <AppText variant="caption" style={styles.badgeText}>
            {rangeLabel}
          </AppText>
        </View>
      </View>

      <View style={styles.amountRow}>
        <AppText variant="display" style={[styles.amount, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatSignedAmount(summary.balance)}
        </AppText>
        <AppText variant="caption" style={styles.currency}>
          تومان
        </AppText>
      </View>

      <AppText variant="caption" style={styles.caption}>
        {caption}
      </AppText>

      <View style={styles.divider} />

      <View style={styles.stats}>
        <StatColumn
          icon="arrow-down"
          color={colors.heroPositive}
          label="مجموع درآمدها"
          value={summary.income}
        />
        <View style={styles.verticalDivider} />
        <StatColumn
          icon="arrow-up"
          color={colors.heroNegative}
          label="مجموع هزینه‌ها"
          value={summary.expense}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.hero,
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    top: -120,
    left: -70,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.66)',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  badgeText: {
    color: 'rgba(255, 255, 255, 0.86)',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  amount: {
    fontSize: 30,
    lineHeight: 44,
    flexShrink: 1,
  },
  currency: {
    color: 'rgba(255, 255, 255, 0.66)',
    marginBottom: 7,
  },
  caption: {
    color: 'rgba(255, 255, 255, 0.48)',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginVertical: spacing.lg,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTexts: {
    flexShrink: 1,
    gap: 1,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  statValue: {
    color: colors.white,
  },
  verticalDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginHorizontal: spacing.md,
  },
});
