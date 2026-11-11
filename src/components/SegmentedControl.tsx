import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { AppText } from './AppText';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}

/** انتخاب دوگانه‌ی «هزینه / درآمد» با ظاهر یکدست. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.selectedSegment]}>
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={16}
                color={selected ? colors.primary : colors.textMuted}
              />
            ) : null}
            <AppText
              variant="label"
              style={[styles.label, selected && styles.selectedLabel]}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  selectedSegment: {
    backgroundColor: colors.surface,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  selectedLabel: {
    color: colors.primary,
  },
});
