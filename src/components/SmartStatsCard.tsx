import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { SmartStats } from '../utils/analytics';
import { formatAmount, formatShortAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { AppText } from './AppText';

function StatTile({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: `${color}1F` }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <AppText variant="caption" style={styles.tileLabel} numberOfLines={1}>
        {label}
      </AppText>
      <AppText
        variant="amountSmall"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}>
        {value}
      </AppText>
    </View>
  );
}

/** خلاصه‌ی آماری هوشمند: میانگین‌ها، پرهزینه‌ترین دسته و بزرگ‌ترین تراکنش. */
export function SmartStatsCard({ stats }: { stats: SmartStats }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
        </View>
        <AppText variant="subtitle">خلاصه‌ی آماری هوشمند</AppText>
        <AppText variant="caption" style={styles.headerHint}>
          {`${toPersianDigits(stats.days)} روز`}
        </AppText>
      </View>

      <View style={styles.grid}>
        <StatTile
          icon="trending-up-outline"
          label="میانگین درآمد روزانه"
          value={formatShortAmount(stats.avgIncome)}
          color={colors.income}
        />
        <StatTile
          icon="trending-down-outline"
          label="میانگین هزینه روزانه"
          value={formatShortAmount(stats.avgExpense)}
          color={colors.expense}
        />
        <StatTile
          icon="pricetag-outline"
          label="پرهزینه‌ترین دسته"
          value={stats.topCategory ? stats.topCategory.name : '—'}
          color={colors.warning}
        />
        <StatTile
          icon="receipt-outline"
          label="بزرگ‌ترین تراکنش"
          value={stats.biggest ? formatAmount(stats.biggest.amount) : '—'}
          color={colors.primary}
        />
      </View>
    </View>
  );
}

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
      gap: spacing.sm,
    },
    headerIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    headerHint: {
      marginRight: 'auto',
      color: colors.textFaint,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    tile: {
      flexBasis: '47%',
      flexGrow: 1,
      minWidth: 0,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
      padding: spacing.md,
      gap: 2,
    },
    tileIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    tileLabel: {
      color: colors.textMuted,
    },
  });
