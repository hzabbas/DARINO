import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius, spacing } from '../theme';
import type { TransactionType } from '../types/models';
import { AppText } from './AppText';

interface TypeSwitchProps {
  value: TransactionType;
  onChange: (value: TransactionType) => void;
}

const OPTIONS = [
  {
    value: 'expense' as TransactionType,
    label: 'ثبت هزینه',
    icon: 'arrow-up-circle' as const,
    color: colors.expense,
    soft: colors.expenseSoft,
  },
  {
    value: 'income' as TransactionType,
    label: 'ثبت درآمد',
    icon: 'arrow-down-circle' as const,
    color: colors.income,
    soft: colors.incomeSoft,
  },
];

/** سوییچ بزرگ انتخاب نوع تراکنش با تم قرمز (هزینه) و سبز (درآمد). */
export function TypeSwitch({ value, onChange }: TypeSwitchProps) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              selected && { backgroundColor: option.soft, borderColor: option.color },
            ]}>
            <Ionicons
              name={option.icon}
              size={22}
              color={selected ? option.color : colors.textFaint}
            />
            <AppText
              variant="label"
              style={[
                styles.label,
                { color: selected ? option.color : colors.textMuted },
                selected && styles.selectedLabel,
              ]}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  option: {
    flex: 1,
    height: 58,
    borderRadius: radius.md + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
  },
  selectedLabel: {
    fontFamily: fonts.semibold,
  },
});
