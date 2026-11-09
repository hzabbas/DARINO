import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import type { CategoryTotal } from '../types/models';
import { formatAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';

interface CategoryBreakdownRowProps {
  item: CategoryTotal;
  /** جمع کل همان نوع، برای محاسبه‌ی درصد */
  total: number;
  onPress?: () => void;
  last?: boolean;
}

/** یک ردیف از تفکیک هزینه/درآمد: مبلغ، تعداد، درصد و نوار سهم. */
export function CategoryBreakdownRow({
  item,
  total,
  onPress,
  last = false,
}: CategoryBreakdownRowProps) {
  const share = total > 0 ? Math.round((item.total / total) * 100) : 0;

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
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

const styles = StyleSheet.create({
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
