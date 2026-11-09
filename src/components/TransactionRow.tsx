import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import type { TransactionWithCategory } from '../types/models';
import { formatAmount } from '../utils/currency';
import { formatShamsiShort } from '../utils/jalali';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';

interface TransactionRowProps {
  transaction: TransactionWithCategory;
  onEdit?: (transaction: TransactionWithCategory) => void;
  onDelete?: (transaction: TransactionWithCategory) => void;
}

function ActionButton({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        danger && styles.dangerButton,
        pressed && styles.pressed,
      ]}>
      <Ionicons name={icon} size={14} color={danger ? colors.expense : colors.textMuted} />
    </Pressable>
  );
}

/** یک تراکنش به شکل کارت، همراه با دکمه‌های ویرایش و حذف سریع. */
export function TransactionRow({ transaction, onEdit, onDelete }: TransactionRowProps) {
  const isIncome = transaction.type === 'income';
  const color = isIncome ? colors.income : colors.expense;
  const note = transaction.note?.trim();

  return (
    <View style={styles.card}>
      <CategoryIcon
        icon={transaction.category_icon ?? 'help-circle-outline'}
        color={transaction.category_color ?? colors.textFaint}
        size={38}
      />

      <View style={styles.middle}>
        <AppText variant="label" numberOfLines={1}>
          {transaction.category_name ?? 'بدون دسته‌بندی'}
        </AppText>
        <AppText variant="caption" numberOfLines={1} style={styles.meta}>
          {`${formatShamsiShort(transaction.date)}${note ? ` · ${note}` : ''}`}
        </AppText>
      </View>

      <View style={styles.side}>
        <AppText variant="amountSmall" style={{ color }} numberOfLines={1}>
          {`${isIncome ? '+' : '−'}${formatAmount(transaction.amount)}`}
        </AppText>

        {onEdit || onDelete ? (
          <View style={styles.actions}>
            {onEdit ? (
              <ActionButton
                icon="pencil-outline"
                label="ویرایش"
                onPress={() => onEdit(transaction)}
              />
            ) : null}
            {onDelete ? (
              <ActionButton
                icon="trash-outline"
                label="حذف"
                danger
                onPress={() => onDelete(transaction)}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 1,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  meta: {
    color: colors.textMuted,
  },
  side: {
    minWidth: 78,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs + 1,
  },
  actionButton: {
    width: 26,
    height: 26,
    borderRadius: radius.sm - 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  dangerButton: {
    backgroundColor: colors.expenseSoft,
  },
  pressed: {
    opacity: 0.6,
  },
});
