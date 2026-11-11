import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { AppText } from './AppText';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'ghost';
  /** رنگ پس‌زمینه در حالت primary (پیش‌فرض: رنگ اصلی برند) */
  backgroundColor?: string;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  icon,
  variant = 'primary',
  backgroundColor,
}: PrimaryButtonProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'ghost'
          ? styles.ghost
          : { backgroundColor: backgroundColor ?? colors.primary },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <View style={styles.content}>
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={variant === 'ghost' ? colors.primary : colors.white}
          />
        ) : null}
        <AppText
          variant="button"
          style={variant === 'ghost' ? styles.ghostLabel : undefined}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  ghost: {
    backgroundColor: colors.primarySoft,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  ghostLabel: {
    color: colors.primary,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.85,
  },
});
