import { StyleSheet, View } from 'react-native';

import { fonts, useThemedStyles, type ThemeColors } from '../theme';
import { getBank } from '../utils/iranianBanks';
import { AppText } from './AppText';
import { BANK_LOGOS } from './bankLogosSvg';

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
  if (Logo) return <Logo size={size} />;

  return (
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
