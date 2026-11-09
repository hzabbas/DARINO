import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/** قالب مشترک همه‌ی صفحه‌ها: پس‌زمینه، حاشیه‌ی ایمن و اسکرول. */
export function Screen({ children, scroll = true, style, contentStyle }: ScreenProps) {
  return (
    <SafeAreaView style={[styles.root, style]} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
});
