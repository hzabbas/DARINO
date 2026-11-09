import type { TransactionWithCategory } from '../types/models';
import { formatAmount } from '../utils/currency';
import { formatJalaliDate, formatShamsiShort } from '../utils/jalali';
import { colors, spacing } from '../theme';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';

interface TransactionRowProps {
  transaction: TransactionWithCategory;
  last?: boolean;
}

export function TransactionRow({ transaction, last = false }: TransactionRowProps) {
  const isIncome = transaction.type === 'income';
  const color = isIncome ? colors.income : colors.expense;

  return (
    <View style={[styles.row, !last && styles.separator]}>
      <CategoryIcon
        icon={transaction.category_icon ?? 'help-circle-outline'}
        color={transaction.category_color ?? colors.textFaint}
      />
      <View style={styles.middle}>
        <AppText variant="label" numberOfLines={1}>
          {transaction.category_name ?? 'بدون دسته‌بندی'}
        </AppText>
        <AppText variant="caption" numberOfLines={1} style={styles.subtitle}>
          {transaction.note?.trim() ? transaction.note : formatJalaliDate(transaction.date)}
        </AppText>
      </View>
      <View style={styles.amountBox}>
        <AppText variant="amountSmall" style={{ color }}>
          {`${isIncome ? '+' : '−'}${formatAmount(transaction.amount)}`}
        </AppText>
        <AppText variant="caption" style={styles.date}>
          {formatShamsiShort(transaction.date)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  subtitle: {
    color: colors.textMuted,
  },
  amountBox: {
    alignItems: 'flex-start',
    gap: 2,
  },
  date: {
    color: colors.textFaint,
  },
});
