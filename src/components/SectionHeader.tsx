import { Pressable, StyleSheet, View } from 'react-native';

import { fonts, colors, spacing } from '../theme';
import { AppText } from './AppText';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function SectionHeader({ title, actionLabel, onActionPress }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <AppText variant="subtitle">{title}</AppText>
      {actionLabel ? (
        <Pressable onPress={onActionPress} hitSlop={8}>
          <AppText variant="caption" style={styles.action}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  action: {
    color: colors.primary,
    fontFamily: fonts.medium,
  },
});
