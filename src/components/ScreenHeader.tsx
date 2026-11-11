import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing, useThemedStyles, type ThemeColors } from '../theme';
import { AppText } from './AppText';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <View style={styles.texts}>
        <AppText variant="title">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  texts: {
    flexShrink: 1,
  },
  subtitle: {
    marginTop: 2,
    color: colors.textMuted,
  },
  right: {
    flexShrink: 0,
    paddingTop: spacing.xs,
  },
});
