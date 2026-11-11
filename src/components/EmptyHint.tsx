import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { AppText } from './AppText';

interface EmptyHintProps {
  icon?: keyof typeof Ionicons.glyphMap;
  text: string;
}

/** پیام خالیِ کوچک برای داخل کارت‌ها و شیت‌ها. */
export function EmptyHint({ icon = 'file-tray-outline', text }: EmptyHintProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={22} color={colors.textFaint} />
      <AppText variant="caption" style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  text: {
    textAlign: 'center',
    color: colors.textMuted,
  },
});
