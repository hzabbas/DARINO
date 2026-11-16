import { useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { formatAmount, parseAmount } from '../utils/currency';
import { formatAmountInWords } from '../utils/numberToWords';
import { onlyDigits } from '../utils/digits';
import { AppText } from './AppText';

interface MoneyInputProps {
  /** Input label above field. */
  label: string;
  /** Current value in Latin digits without thousands separator. */
  value: string;
  /** Callback returning new value in Latin digits. */
  onChangeValue: (digits: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  /** Helper text displayed when amount is 0. */
  emptyHint?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Maximum allowed digit count. */
const MAX_DIGITS = 15;

/**
 * Currency input field with live thousands grouping and verbal preview.
 */
export function MoneyInput({
  label,
  value,
  onChangeValue,
  placeholder = '۰',
  onFocus,
  emptyHint,
  accessibilityLabel,
  style,
}: MoneyInputProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const amount = parseAmount(value);
  const display = value === '' ? '' : formatAmount(amount);

  return (
    <View style={[styles.container, style]}>
      <AppText variant="caption" style={styles.label}>
        {label}
      </AppText>

      <TextInput
        value={display}
        onChangeText={(text) => onChangeValue(onlyDigits(text).slice(0, MAX_DIGITS))}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.primary}
        style={[styles.input, focused && styles.inputFocused]}
        accessibilityLabel={accessibilityLabel ?? label}
      />

      {amount > 0 ? (
        <AppText variant="caption" style={styles.preview} numberOfLines={2}>
          {`${formatAmountInWords(amount)} · معادل ${formatAmount(amount * 10)} ریال`}
        </AppText>
      ) : emptyHint ? (
        <AppText variant="caption" style={styles.hint}>
          {emptyHint}
        </AppText>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { gap: spacing.xs },
    label: { color: colors.textMuted },
    input: {
      fontFamily: fonts.semibold,
      fontWeight: 'normal',
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
      // LTR writing direction with right alignment for currency input.
      writingDirection: 'ltr',
      textAlign: 'right',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 46,
    },
    inputFocused: { borderColor: colors.primary },
    preview: { color: colors.textMuted, lineHeight: 18 },
    hint: { color: colors.textFaint, lineHeight: 18 },
  });
