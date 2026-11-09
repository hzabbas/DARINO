import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius } from '../theme';
import { AppText } from './AppText';

export interface RangeTabOption<T extends string> {
  value: T;
  label: string;
}

interface RangeTabsProps<T extends string> {
  value: T;
  options: RangeTabOption<T>[];
  onChange: (value: T) => void;
}

/** نوار انتخاب بازه‌ی زمانی؛ برای داشبورد و گزارش‌ها استفاده می‌شود. */
export function RangeTabs<T extends string>({ value, options, onChange }: RangeTabsProps<T>) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.tab, selected && styles.selectedTab]}>
            <AppText
              variant="label"
              numberOfLines={1}
              style={[styles.label, selected && styles.selectedLabel]}>
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
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
    gap: 3,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  selectedTab: {
    backgroundColor: colors.surface,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: 'center',
    color: colors.textMuted,
  },
  selectedLabel: {
    color: colors.primary,
  },
});
