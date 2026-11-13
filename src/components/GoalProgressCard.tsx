import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { formatAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { AppText } from './AppText';

interface GoalProgressCardProps {
  income: number;
  expense: number;
  /** هدف درآمد ماهانه؛ ۰ یعنی تعیین نشده */
  incomeGoal: number;
  /** سقف بودجه‌ی هزینه ماهانه؛ ۰ یعنی تعیین نشده */
  expenseBudget: number;
}

function toneFor(percent: number, colors: ThemeColors): { color: string; label: string; icon: keyof typeof Ionicons.glyphMap } {
  if (percent >= 100) {
    return { color: colors.expense, label: 'از سقف گذشته', icon: 'alert-circle' };
  }
  if (percent >= 80) {
    return { color: colors.warning, label: 'نزدیک سقف', icon: 'warning' };
  }
  return { color: colors.primary, label: 'در محدوده', icon: 'checkmark-circle' };
}

function ProgressRow({
  title,
  hint,
  value,
  target,
  color,
  trailing,
}: {
  title: string;
  hint: string;
  value: number;
  target: number;
  color: string;
  trailing: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const percent = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <AppText variant="caption" style={styles.rowTitle}>
          {title}
        </AppText>
        <AppText variant="caption" weight="semibold" style={[styles.rowValue, { color }]}>
          {`${toPersianDigits(Math.round(target > 0 ? (value / target) * 100 : 0))}٪`}
        </AppText>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>

      <View style={styles.rowFooter}>
        <AppText variant="caption" style={styles.hint} numberOfLines={1}>
          {hint}
        </AppText>
        <AppText variant="caption" style={styles.hint} numberOfLines={1}>
          {trailing}
        </AppText>
      </View>
    </View>
  );
}

/**
 * هدف درآمد و سقف بودجه‌ی ماه؛ با عبور از ۸۰٪ و ۱۰۰٪ رنگ هشدار می‌گیرد.
 */
export function GoalProgressCard({ income, expense, incomeGoal, expenseBudget }: GoalProgressCardProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (incomeGoal <= 0 && expenseBudget <= 0) {
    return null;
  }

  const budgetTone = toneFor(expenseBudget > 0 ? (expense / expenseBudget) * 100 : 0, colors);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="flag-outline" size={15} color={colors.primary} />
        </View>
        <AppText variant="subtitle">هدف و بودجه‌ی این ماه</AppText>
      </View>

      {incomeGoal > 0 ? (
        <ProgressRow
          title="هدف درآمد"
          hint={`${formatAmount(income)} از ${formatAmount(incomeGoal)}`}
          value={income}
          target={incomeGoal}
          color={colors.primary}
          trailing={income >= incomeGoal ? 'هدف محقق شد 🎉' : `${formatAmount(Math.max(0, incomeGoal - income))} باقی مانده`}
        />
      ) : null}

      {expenseBudget > 0 ? (
        <ProgressRow
          title="سقف بودجه‌ی هزینه"
          hint={`${formatAmount(expense)} از ${formatAmount(expenseBudget)}`}
          value={expense}
          target={expenseBudget}
          color={budgetTone.color}
          trailing={
            expense > expenseBudget
              ? `${formatAmount(expense - expenseBudget)} بیش از بودجه`
              : `${formatAmount(expenseBudget - expense)} باقی مانده`
          }
        />
      ) : null}

      {expenseBudget > 0 ? (
        <View style={[styles.status, { backgroundColor: `${budgetTone.color}1A` }]}>
          <Ionicons name={budgetTone.icon} size={13} color={budgetTone.color} />
          <AppText
            variant="caption"
            weight="medium"
            style={[styles.statusText, { color: budgetTone.color }]}>
            {`وضعیت بودجه: ${budgetTone.label}`}
          </AppText>
        </View>
      ) : null}
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
    row: {
      gap: spacing.xs,
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowTitle: {
      color: colors.textMuted,
    },
    rowValue: {},
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: 4,
    },
    rowFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    hint: {
      color: colors.textFaint,
    },
    status: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 1,
      alignSelf: 'flex-start',
    },
    statusText: {},
  });
