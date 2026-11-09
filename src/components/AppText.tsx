import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from '../theme';

export type TextVariant =
  | 'display'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'label'
  | 'caption'
  | 'amount'
  | 'amountSmall'
  | 'button';

const variantStyles: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 44, color: colors.text },
  title: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30, color: colors.text },
  subtitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 24, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 23, color: colors.text },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 21, color: colors.text },
  caption: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 19, color: colors.textMuted },
  amount: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 38, color: colors.text },
  amountSmall: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 22, color: colors.text },
  button: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 24, color: colors.white },
};

export type AppTextProps = TextProps & {
  variant?: TextVariant;
};

/**
 * تنها کامپوننت متن در پروژه؛ فونت فارسی و راست‌چین‌بودن را تضمین می‌کند.
 */
export function AppText({ variant = 'body', style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[styles.base, variantStyles[variant], style]} />;
}

const styles = StyleSheet.create({
  base: {
    textAlign: 'right',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
});
