import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  useWindowDimensions,
  type KeyboardEvent,
  type LayoutChangeEvent,
} from 'react-native';

import {
  RESIZE_THRESHOLD,
  computeSheetKeyboardMetrics,
  contentKeyboardPadding,
  isWindowResized,
  type SheetKeyboardMetrics,
} from '../utils/keyboard';

export interface KeyboardState {
  /** ارتفاع کیبورد به پیکسل؛ ۰ یعنی بسته است */
  keyboardHeight: number;
  isKeyboardVisible: boolean;
}

/**
 * وضعیت کیبورد.
 *
 * روی iOS رویداد `keyboardWillShow/Hide` (که پیش از انیمیشن می‌آید) و روی اندروید
 * `keyboardDidShow/Hide` گوش داده می‌شود؛ چون اندروید رویداد will را در همه‌ی
 * نسخه‌ها نمی‌فرستد.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({
    keyboardHeight: 0,
    isKeyboardVisible: false,
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      const height = Math.round(event.endCoordinates?.height ?? 0);
      setState({ keyboardHeight: height, isKeyboardVisible: height > 0 });
    });

    const hide = Keyboard.addListener(hideEvent, () => {
      setState({ keyboardHeight: 0, isKeyboardVisible: false });
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return state;
}

/** ارتفاع کیبورد به پیکسل. */
export function useKeyboardHeight(): number {
  return useKeyboard().keyboardHeight;
}

export function useKeyboardVisible(): boolean {
  return useKeyboard().isKeyboardVisible;
}

/**
 * فاصله‌ی پایین محتوای صفحه‌های اسکرولی.
 *
 * روی اندروید با `softwareKeyboardLayoutMode: resize` پنجره‌ی برنامه بومی کوچک
 * می‌شود، پس اگر ارتفاع پنجره واقعاً کم شده باشد صفر برمی‌گردانیم تا محتوا
 * دو بار جا باز نکند.
 */
export function useKeyboardPadding(extra = 24): number {
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();
  const { height } = useWindowDimensions();
  const baselineRef = useRef(0);

  useEffect(() => {
    if (!isKeyboardVisible) {
      baselineRef.current = Math.max(baselineRef.current, height);
    }
  }, [height, isKeyboardVisible]);

  const windowResized =
    isKeyboardVisible && isWindowResized(height, baselineRef.current, RESIZE_THRESHOLD);

  return contentKeyboardPadding({
    keyboardHeight,
    isKeyboardVisible,
    platform: Platform.OS,
    windowResized,
    extra,
  });
}

export interface SheetKeyboardState extends SheetKeyboardMetrics {
  /** روی کانتینر شیت (overlay یا backdrop) بگذارید تا ارتفاع واقعی اندازه‌گیری شود */
  onLayout: (event: LayoutChangeEvent) => void;
}

/**
 * هندسه‌ی شیت‌های شناور داخل `<Modal>`.
 *
 * دیالوگ بومی اندروید از `adjustResize` اکتیویتی پیروی نمی‌کند و شیت زیر کیبورد
 * می‌ماند؛ پس ارتفاع کیبورد را خودمان به عنوان فاصله‌ی پایین شیت اضافه می‌کنیم و
 * ارتفاع مجاز شیت را هم کم می‌کنیم تا سربرگ بیرون از صفحه نرود. اگر پنجره (در
 * دیالوگ‌هایی که سیستم خودش resize می‌کند) کوچک شده باشد فاصله صفر می‌شود تا
 * padding دو بار اضافه نشود.
 */
export function useSheetKeyboard(topInset = 0): SheetKeyboardState {
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();
  const [containerHeight, setContainerHeight] = useState(0);
  const baselineRef = useRef(0);
  const visibleRef = useRef(isKeyboardVisible);

  useEffect(() => {
    visibleRef.current = isKeyboardVisible;
  }, [isKeyboardVisible]);

  useEffect(() => {
    if (containerHeight === 0) {
      // قبل از اولین اندازه‌گیری، ارتفاع پنجره تخمین زده می‌شود
      setContainerHeight(Math.round(Dimensions.get('window').height));
    }
  }, [containerHeight]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height <= 0) return;
    setContainerHeight(height);
    if (!visibleRef.current) {
      baselineRef.current = Math.max(baselineRef.current, height);
    }
  }, []);

  const metrics = useMemo(
    () =>
      computeSheetKeyboardMetrics({
        containerHeight,
        baselineHeight: baselineRef.current,
        keyboardHeight,
        isKeyboardVisible,
        topInset,
        platform: Platform.OS,
      }),
    [containerHeight, keyboardHeight, isKeyboardVisible, topInset],
  );

  return { ...metrics, onLayout };
}

/** برای دکمه‌های «بستن کیبورد» */
export function dismissKeyboard(): void {
  Keyboard.dismiss();
}
