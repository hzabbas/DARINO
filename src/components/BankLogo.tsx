import { Component, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, useThemedStyles, type ThemeColors } from '../theme';
import { getBank } from '../utils/iranianBanks';
import { AppText } from './AppText';
import { BANK_LOGOS } from './bankLogosSvg';

/**
 * Error boundary fallback for SVG bank emblems.
 */
class EmblemBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.warn('[BankLogo] SVG render error, using fallback badge:', error?.message);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Bank logo component rendering vector SVG emblems with monogram badge fallback.
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
