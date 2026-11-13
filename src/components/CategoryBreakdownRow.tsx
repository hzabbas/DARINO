import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';
import type { CategoryTotal } from '../types/models';
import { formatAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';

interface CategoryBreakdownRowProps {
  item: CategoryTotal;
  /** جمع کل همان نوع، برای محاسبه‌ی درصد */
  total: number;
  /**
   * با خودِ آیتم صدا زده می‌شود (نه با یک closure تازه) تا `memo` روی ردیف‌های
   * بدون تغییر اثر داشته باشد.
   */
  onSelect?: (item: CategoryTotal) => void;
  last?: boolean;
}

/** یک ردیف از تفکیک هزینه/درآمد: مبلغ، تعداد، درصد و نوار سهم. */
function CategoryBreakdownRowComponent({
  item,
  total,
  onSelect,
  last = false,
}: CategoryBreakdownRowProps) {
  const styles = useThemedStyles(makeStyles);
  const share = total > 0 ? Math.round((item.total / total) * 100) : 0;

  return (
    <Pressable
      disabled={!onSelect}
      onPress={onSelect ? () => onSelect(item) : undefined}
      accessibilityRole={onSelect ? 'button' : undefined}
      style={({ pressed }) => [styles.row, !last && styles.separator, pressed && styles.pressed]}>
      <View style={styles.topRow}>
        <CategoryIcon icon={item.icon} color={item.color} size={36} />

        <View style={styles.texts}>
          <AppText variant="label" numberOfLines={1}>
            {item.name}
          </AppText>
          <AppText variant="caption" style={styles.meta} numberOfLines={1}>
            {`${formatAmount(item.total)} تومان · ${toPersianDigits(item.count)} تراکنش`}
          </AppText>
        </View>

        <AppText variant="amountSmall" style={styles.share}>
          {`${toPersianDigits(share)}٪`}
        </AppText>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.max(share, 2)}%`, backgroundColor: item.color },
          ]}
        />
      </View>
    </Pressable>
  );
}

export const CategoryBreakdownRow = memo(CategoryBreakdownRowComponent);

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.background,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  meta: {
    color: colors.textMuted,
  },
  share: {
    minWidth: 44,
    textAlign: 'left',
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
