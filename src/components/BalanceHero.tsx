import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { MonthlySummary } from '../types/models';
import { formatAmount, formatSignedAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
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
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <View style={styles.statTexts}>
        <AppText variant="caption" style={styles.statLabel} numberOfLines={1}>
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

/**
 * کارت برجسته‌ی وضعیت مالی: سود خالص، حاشیه‌ی سود و جمع درآمد/هزینه.
 * پس‌زمینه‌ی زمردی تیره با حلقه‌های نورانی ظریف.
 */
export function BalanceHero({ summary, rangeLabel, caption }: BalanceHeroProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const positive = summary.balance > 0;
  const negative = summary.balance < 0;
  const tone = positive ? colors.heroPositive : negative ? colors.heroNegative : colors.white;
  const margin = summary.income > 0 ? Math.round((summary.balance / summary.income) * 100) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.glowLarge} />
      <View style={styles.glowSmall} />
      <View style={styles.ring} />

      <View style={styles.topRow}>
        <View style={styles.labelRow}>
          <Ionicons name="wallet-outline" size={14} color="rgba(255, 255, 255, 0.62)" />
          <AppText variant="caption" style={styles.label}>
            سود خالص
          </AppText>
        </View>
        <View style={styles.badge}>
          <AppText variant="caption" style={styles.badgeText}>
            {rangeLabel}
          </AppText>
        </View>
      </View>

      <View style={styles.amountRow}>
        <AppText
          variant="display"
          style={[styles.amount, { color: tone }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatSignedAmount(summary.balance)}
        </AppText>
        <AppText variant="caption" style={styles.currency}>
          تومان
        </AppText>
      </View>

      <View style={styles.metaRow}>
        <AppText variant="caption" style={styles.caption}>
          {caption}
        </AppText>

        {summary.income > 0 ? (
          <View style={styles.marginPill}>
            <Ionicons
              name={margin >= 0 ? 'trending-up' : 'trending-down'}
              size={12}
              color={margin >= 0 ? colors.heroPositive : colors.heroNegative}
            />
            <AppText variant="caption" style={styles.marginText}>
              {`حاشیه سود ${toPersianDigits(Math.abs(margin))}٪`}
            </AppText>
          </View>
        ) : null}
      </View>

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

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.hero,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.heroBorder,
      padding: spacing.xl,
      overflow: 'hidden',
    },
    glowLarge: {
      position: 'absolute',
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: 'rgba(255, 255, 255, 0.055)',
      top: -140,
      left: -80,
    },
    glowSmall: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: 'rgba(52, 211, 153, 0.10)',
      bottom: -60,
      right: -30,
    },
    ring: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 75,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.07)',
      top: -40,
      right: -40,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
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
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: 2,
    },
    caption: {
      color: 'rgba(255, 255, 255, 0.48)',
    },
    marginPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    marginText: {
      color: 'rgba(255, 255, 255, 0.8)',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(255, 255, 255, 0.14)',
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
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: 'rgba(255, 255, 255, 0.14)',
      marginHorizontal: spacing.md,
    },
  });
