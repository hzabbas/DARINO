import { useEffect, type ReactNode } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenScrollContext, useFocusScroll } from '../hooks/useFocusScroll';
import { useKeyboardPadding } from '../hooks/useKeyboard';
import { spacing, useThemedStyles, type ThemeColors } from '../theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * قالب مشترک همه‌ی صفحه‌ها: پس‌زمینه، حاشیه‌ی ایمن و اسکرول.
 *
 * مدیریت کیبورد:
 *  - اندروید با `softwareKeyboardLayoutMode: resize` به‌صورت بومی پنجره را کوچک
 *    می‌کند؛ پس اگر ارتفاع پنجره واقعاً کم شده باشد، padding اضافه نمی‌شود
 *    (فاصله‌ی دو‌باره). روی iOS که پنجره کوچک نمی‌شود، به اندازه‌ی کیبورد فاصله
 *    می‌دهیم.
 *  - فیلد فوکوس‌شده (حتی ورودی‌های پایین مثل «توضیحات») به بالای کیبورد اسکرول
 *    می‌شود. کامپوننت‌های فرزند هم می‌توانند با `useScreenFocusScroll()` روی
 *    `onFocus` خودشان همین کار را دقیق‌تر انجام بدهند.
 */
export function Screen({ children, scroll = true, style, contentStyle }: ScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const keyboardPadding = useKeyboardPadding(28);
  const focusScroll = useFocusScroll();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        // یک تیک صبر می‌کنیم تا چیدمان بعد از تغییر ارتفاع پنجره تمام شود
        setTimeout(() => focusScroll.scrollInputIntoView(), 90);
      },
    );

    return () => subscription.remove();
  }, [focusScroll]);

  return (
    <SafeAreaView style={[styles.root, style]} edges={['top', 'left', 'right']}>
      <ScreenScrollContext.Provider value={focusScroll}>
        {scroll ? (
          <ScrollView
            ref={focusScroll.scrollRef}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: spacing.xxl + keyboardPadding },
              contentStyle,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>
        )}
      </ScreenScrollContext.Provider>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
