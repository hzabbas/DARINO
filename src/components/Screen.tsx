import { useEffect, useRef, type ReactNode } from 'react';
import {
  findNodeHandle,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useKeyboardPadding } from '../hooks/useKeyboard';
import { spacing, useThemedStyles, type ThemeColors } from '../theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

interface ScrollWithResponder extends ScrollView {
  scrollResponderScrollNativeHandleToKeyboard?: (
    nodeHandle: number,
    additionalOffset?: number,
    preventNegativeScrollOffset?: boolean,
  ) => void;
}

/**
 * قالب مشترک همه‌ی صفحه‌ها: پس‌زمینه، حاشیه‌ی ایمن و اسکرول.
 *
 * مدیریت کیبورد:
 *  - اندروید با `softwareKeyboardLayoutMode: resize` به‌صورت بومی پنجره را کوچک می‌کند.
 *  - وقتی کیبورد باز می‌شود، فیلد فوکوس‌شده به بالای کیبورد اسکرول می‌شود تا
 *    دکمه‌ی ذخیره و خود فیلد همیشه در دید باشند.
 */
export function Screen({ children, scroll = true, style, contentStyle }: ScreenProps) {
  const styles = useThemedStyles(makeStyles);
  // متد scrollResponderScrollNativeHandleToKeyboard در تایپ‌های RN نیست ولی در runtime موجود است
  const scrollRef = useRef<any>(null);
  const keyboardPadding = useKeyboardPadding(28);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        const focused = TextInput.State.currentlyFocusedInput?.();
        const handle = focused ? findNodeHandle(focused) : null;
        const responder = scrollRef.current as ScrollWithResponder | null;

        if (!handle || !responder?.scrollResponderScrollNativeHandleToKeyboard) {
          return;
        }

        // یک تیک صبر می‌کنیم تا چیدمان بعد از تغییر ارتفاع پنجره تمام شود
        setTimeout(() => {
          responder.scrollResponderScrollNativeHandleToKeyboard?.(handle, 48, true);
        }, 90);
      },
    );

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaView style={[styles.root, style]} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
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
