import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { radius, useTheme, useThemedStyles, type ThemeColors } from '../theme';

/**
 * دکمه‌ی خورشید/ماه؛ بین تم روشن و تاریک جابه‌جا می‌کند.
 * (حالت «هماهنگ با سیستم» از صفحه‌ی تنظیمات انتخاب می‌شود.)
 */
export function ThemeToggle({ size = 36 }: { size?: number }) {
  const { scheme, toggle, colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isDark = scheme === 'dark';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'روشن کردن تم' : 'تاریک کردن تم'}
      hitSlop={6}
      onPress={toggle}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: radius.sm + 2 },
        pressed && styles.pressed,
      ]}>
      <Ionicons
        name={isDark ? 'sunny-outline' : 'moon-outline'}
        size={18}
        color={isDark ? '#FBBF24' : colors.textMuted}
      />
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    pressed: {
      opacity: 0.7,
    },
  });
