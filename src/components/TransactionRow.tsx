import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { TransactionWithCategory } from '../types/models';
import { formatAmount } from '../utils/currency';
import { formatShamsiShort } from '../utils/jalali';
import { AppText } from './AppText';

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
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

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

/**
 * یک تراکنش به شکل کارت مدرن: آیکون رنگی در قاب نرم، مبلغ علامت‌دار و
 * دکمه‌های ویرایش/حذف. لمس کارت کمی جمع می‌شود تا حس زنده‌بودن بدهد.
 */
export function TransactionRow({ transaction, onEdit, onDelete }: TransactionRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      friction: 7,
      tension: 140,
    }).start();
  };

  const isIncome = transaction.type === 'income';
  const color = isIncome ? colors.income : colors.expense;
  const note = transaction.note?.trim();
  const categoryColor = transaction.category_color ?? colors.textFaint;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View style={styles.card}>
        <Pressable
          accessibilityRole={onEdit ? 'button' : undefined}
          accessibilityLabel={onEdit ? `ویرایش ${transaction.category_name ?? 'تراکنش'}` : undefined}
          disabled={!onEdit}
          onPress={onEdit ? () => onEdit(transaction) : undefined}
          onPressIn={() => animate(0.98)}
          onPressOut={() => animate(1)}
          style={styles.main}>
          <View
            style={[
              styles.badge,
              { backgroundColor: `${categoryColor}1A`, borderColor: `${categoryColor}30` },
            ]}>
            <Ionicons
              name={(transaction.category_icon ?? 'help-circle-outline') as keyof typeof Ionicons.glyphMap}
              size={18}
              color={categoryColor}
            />
          </View>

          <View style={styles.middle}>
            <AppText variant="label" numberOfLines={1}>
              {transaction.category_name ?? 'بدون دسته‌بندی'}
            </AppText>
            <AppText variant="caption" numberOfLines={1} style={styles.meta}>
              {`${formatShamsiShort(transaction.date)}${note ? ` · ${note}` : ''}`}
            </AppText>
          </View>
        </Pressable>

        <View style={styles.side}>
          <AppText variant="amountSmall" style={{ color }} numberOfLines={1}>
            {`${isIncome ? '+' : '−'}${formatAmount(transaction.amount)}`}
          </AppText>

          {onEdit || onDelete ? (
            <View style={styles.actions}>
              {onEdit ? (
                <ActionButton icon="pencil-outline" label="ویرایش" onPress={() => onEdit(transaction)} />
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
    </Animated.View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    badge: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    main: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
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
