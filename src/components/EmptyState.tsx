import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { AppText } from './AppText';
import { PrimaryButton } from './PrimaryButton';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <AppText variant="subtitle" style={styles.title}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="caption" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onActionPress ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel} onPress={onActionPress} />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.xs,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    color: colors.textMuted,
  },
  action: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
