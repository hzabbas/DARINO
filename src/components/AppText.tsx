import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { fonts, useTheme, type ThemeColors } from '../theme';

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

export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

const VARIANT_BASE: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 44 },
  title: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 },
  caption: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 19 },
  amount: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 38 },
  amountSmall: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 22 },
  button: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 24 },
};

function variantColors(colors: ThemeColors): Record<TextVariant, string> {
  return {
    display: colors.text,
    title: colors.text,
    subtitle: colors.text,
    body: colors.text,
    label: colors.text,
    caption: colors.textMuted,
    amount: colors.text,
    amountSmall: colors.text,
    button: colors.white,
  };
}

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  /** وزن فونت را با خانواده‌ی وزیرمتن عوض می‌کند، نه با fontWeight */
  weight?: TextWeight;
  /** رنگ متن؛ پیش‌فرض از تم گرفته می‌شود */
  tone?: 'text' | 'muted' | 'faint' | 'primary' | 'income' | 'expense' | 'white' | 'warning';
};

/**
 * تنها کامپوننت متن در پروژه.
 *
 * روی اندروید اگر fontFamily سفارشی با fontWeight ترکیب شود، اندروید فونت وزن‌دار
 * را پیدا نمی‌کند و به فونت سیستم برمی‌گردد؛ برای همین وزن همیشه از طریق
 * خانواده‌ی فونت (Vazirmatn-Medium و …) و با fontWeight: 'normal' اعمال می‌شود.
 */
export function AppText({ variant = 'body', weight, tone, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const tones = variantColors(colors);

  const weightStyle: TextStyle | null = weight
    ? { fontFamily: fonts[weight], fontWeight: 'normal' }
    : null;

  const toneColor = tone
    ? {
        text: colors.text,
        muted: colors.textMuted,
        faint: colors.textFaint,
        primary: colors.primary,
        income: colors.income,
        expense: colors.expense,
        white: colors.white,
        warning: colors.warning,
      }[tone]
    : null;

  return (
    <Text
      {...rest}
      style={[
        styles.base,
        VARIANT_BASE[variant],
        { color: tones[variant] },
        toneColor ? { color: toneColor } : null,
        weightStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    textAlign: 'right',
    writingDirection: 'rtl',
    includeFontPadding: false,
    fontWeight: 'normal',
  },
});
