import { createContext, useContext, useMemo } from 'react';

/**
 * سیستم طراحی دارینو.
 *
 * هر رنگ فقط از دو پالت زیر می‌آید؛ کامپوننت‌ها رنگ را از هوک `useTheme()` می‌گیرند
 * تا با تغییر تم، بدون ری‌استارت دوباره رندر شوند.
 */
export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorSchemeName = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;

  primary: string;
  primaryDark: string;
  primarySoft: string;

  income: string;
  incomeSoft: string;

  expense: string;
  expenseSoft: string;

  warning: string;
  warningSoft: string;

  text: string;
  textMuted: string;
  textFaint: string;

  hero: string;
  heroBorder: string;
  heroPositive: string;
  heroNegative: string;

  border: string;
  white: string;
  overlay: string;
}

/** تم روشن: تمیز، آرام و با سایه‌های نرم. */
export const lightColors: ThemeColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',

  primary: '#059669',
  primaryDark: '#047857',
  primarySoft: '#ECFDF5',

  income: '#10B981',
  incomeSoft: '#ECFDF5',

  expense: '#EF4444',
  expenseSoft: '#FEF2F2',

  warning: '#D97706',
  warningSoft: '#FFFBEB',

  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',

  hero: '#064E3B',
  heroBorder: 'rgba(255, 255, 255, 0.08)',
  heroPositive: '#6EE7B7',
  heroNegative: '#FDA4AF',

  border: '#E2E8F0',
  white: '#FFFFFF',
  overlay: 'rgba(15, 23, 42, 0.05)',
};

/** تم تاریک لوکس: سرمه‌ای عمیق که در شب چشم را نمی‌زند. */
export const darkColors: ThemeColors = {
  background: '#090D16',
  surface: '#131B2E',
  surfaceMuted: '#1B2437',

  primary: '#10B981',
  primaryDark: '#34D399',
  primarySoft: '#0E2A22',

  income: '#34D399',
  incomeSoft: '#0E2A22',

  expense: '#F87171',
  expenseSoft: '#2A1418',

  warning: '#FBBF24',
  warningSoft: '#2A2110',

  text: '#F8FAFC',
  textMuted: '#A3B1C6',
  textFaint: '#7A8AA3',

  hero: '#0E2A22',
  heroBorder: 'rgba(16, 185, 129, 0.18)',
  heroPositive: '#34D399',
  heroNegative: '#FB7185',

  border: '#1E293B',
  white: '#FFFFFF',
  overlay: 'rgba(248, 250, 252, 0.05)',
};

export const palettes: Record<ColorSchemeName, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const fonts = {
  regular: 'Vazirmatn',
  medium: 'Vazirmatn-Medium',
  semibold: 'Vazirmatn-SemiBold',
  bold: 'Vazirmatn-Bold',
} as const;

/** سایه‌ی کارت‌ها؛ در تم تاریک فقط حاشیه‌ی نازک دیده می‌شود. */
export const cardShadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

export const tabBarHeight = 62;

export interface ThemeContextValue {
  mode: ThemeMode;
  scheme: ColorSchemeName;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme باید داخل ThemeProvider استفاده شود');
  }
  return value;
}

/**
 * استایل‌های وابسته به تم را یک بار برای هر پالت می‌سازد.
 * factory باید بیرون از کامپوننت تعریف شود تا مرجعش ثابت بماند.
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}

/** رنگ متناسب با نوع تراکنش. */
export function typeColor(colors: ThemeColors, type: 'income' | 'expense'): string {
  return type === 'income' ? colors.income : colors.expense;
}
