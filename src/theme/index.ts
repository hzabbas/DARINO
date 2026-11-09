import { Platform } from 'react-native';

/**
 * پالت رنگی و توکن‌های طراحی دارینو.
 * همه‌ی صفحه‌ها فقط از همین مقادیر استفاده می‌کنند تا ظاهر برنامه یکدست بماند.
 */
export const colors = {
  background: '#F5F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2F7',

  primary: '#0F766E',
  primaryDark: '#0B5A54',
  primarySoft: '#E4F3F0',

  income: '#15803D',
  incomeSoft: '#E8F7EE',

  expense: '#DC2626',
  expenseSoft: '#FDECEC',

  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',

  hero: '#0B3B38',
  heroPositive: '#34D399',
  heroNegative: '#FB7185',

  border: '#E2E8F0',
  white: '#FFFFFF',
  overlay: 'rgba(15, 23, 42, 0.05)',
} as const;

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

export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 2 },
  default: {},
});

export const tabBarHeight = 62;
