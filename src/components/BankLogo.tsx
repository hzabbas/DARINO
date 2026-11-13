import { Component, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, useThemedStyles, type ThemeColors } from '../theme';
import { getBank } from '../utils/iranianBanks';
import { AppText } from './AppText';
import { BANK_LOGOS } from './bankLogosSvg';

/**
 * تور محلی برای نشان برداری.
 *
 * اگر یک نشان به هر دلیلی نتواند رندر شود (نمونه‌ی معیوب، نبودِ view manager در
 * بیلد release یا هر خطای غیرمنتظره در RNSVG)، همان قاب حرف‌دار قبلی نشان داده
 * می‌شود؛ یک آیکون خراب نباید کل صفحه را زمین بزند. ErrorBoundary در بیلد نیتیو
 * باید کلاس باشد، پس این کوچک‌ترین کلاس ممکن است.
 */
class EmblemBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.warn('[BankLogo] نشان بانک رندر نشد؛ قاب حرف‌دار جایگزین شد:', error?.message);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * نشان گرافیکی بانک.
 *
 * برای بانک‌های شناخته‌شده، نشان برداری رسمی‌نما از bankLogosSvg کشیده می‌شود و
 * برای بقیه (از جمله `other`) قاب رنگی با حروف کوتاه فارسی جایگزین می‌ماند؛
 * بدون تصویر خارجی، پس در هر اندازه‌ای شارپ است.
 */
export function BankLogo({ code, size = 42 }: { code: string; size?: number }) {
  const styles = useThemedStyles(makeStyles);
  const bank = getBank(code);
  const Logo = BANK_LOGOS[code];

  const badge = (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: `${bank.color}1A`,
          borderColor: `${bank.color}48`,
        },
      ]}>
      <AppText
        style={[styles.label, { color: bank.color, fontSize: Math.max(9, size * 0.27) }]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {bank.badge}
      </AppText>
    </View>
  );

  if (!Logo) return badge;

  return (
    <EmblemBoundary fallback={badge}>
      <Logo size={size} />
    </EmblemBoundary>
  );
}

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    badge: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      paddingHorizontal: 2,
    },
    label: {
      fontFamily: fonts.bold,
      textAlign: 'center',
    },
  });
