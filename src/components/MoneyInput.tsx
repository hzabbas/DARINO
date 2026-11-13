import { useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { formatAmount, parseAmount } from '../utils/currency';
import { formatAmountInWords } from '../utils/numberToWords';
import { onlyDigits } from '../utils/digits';
import { AppText } from './AppText';

interface MoneyInputProps {
  /** برچسب بالای فیلد */
  label: string;
  /** مقدار فعلی به شکل ارقام لاتین بدون جداکننده («۱۲۵۰۰۰۰» ذخیره می‌شود، «۱۲۵۰۰۰۰» نمایش) */
  value: string;
  /** مقدار جدید همیشه ارقام لاتین و بدون جداکننده است */
  onChangeValue: (digits: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  /** متن کمکی زیر فیلد وقتی عدد صفر است */
  emptyHint?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** بیشترین تعداد رقم قابل قبول؛ جلوی «صفرِ اضافه» و سرریز عددی را می‌گیرد. */
const MAX_DIGITS = 15;

/**
 * فیلد مبلغ مشترک همه‌ی صفحه‌ها.
 *
 * مقدار هم‌زمان که کاربر تایپ می‌کند با جداکننده‌ی هزارگان گروه‌بندی می‌شود
 * («۱۲۵۰۰۰۰» → «۱,۲۵۰,۰۰۰») و زیر فیلد همان عدد با حروف فارسی نوشته می‌شود
 * («یک میلیون و دویست و پنجاه هزار تومان») به‌همراه معادل ریالی؛ بنابراین کاربر
 * هیچ‌وقت اشتباهاً یک صفر کم/زیاد وارد نمی‌کند.
 *
 * ارقام فارسی و عربی هم پذیرفته می‌شوند (`onlyDigits` همه را به لاتین برمی‌گرداند).
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
      // ورودی عددی: چپ‌به‌راست با چیدمان راست‌چین تا مکان‌نما روی placeholder نیفتد
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
