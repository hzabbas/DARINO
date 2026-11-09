import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';
import { AppText } from './AppText';

interface EmptyHintProps {
  icon?: keyof typeof Ionicons.glyphMap;
  text: string;
}

/** پیام خالیِ کوچک برای داخل کارت‌ها و شیت‌ها. */
export function EmptyHint({ icon = 'file-tray-outline', text }: EmptyHintProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={22} color={colors.textFaint} />
      <AppText variant="caption" style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
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
