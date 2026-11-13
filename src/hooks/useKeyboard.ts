import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

/**
 * ارتفاع کیبورد به پیکسل.
 *
 * روی اندروید با `softwareKeyboardLayoutMode: resize` پنجره‌ی برنامه بومی کوچک
 * می‌شود، پس این ارتفاع فقط برای محاسبه‌ی فاصله‌ی امن استفاده می‌شود و نباید
 * دوباره به padding اضافه شود. روی iOS پنجره کوچک نمی‌شود و padding لازم است.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setHeight(Math.round(event.endCoordinates?.height ?? 0));
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

/**
 * فاصله‌ی پایین محتوا وقتی کیبورد باز است:
 * iOS به اندازه‌ی کیبورد، اندروید فقط یک حاشیه‌ی کوچک (چون پنجره resize می‌شود).
 */
export function useKeyboardPadding(extra = 24): number {
  const height = useKeyboardHeight();
  const hasKeyboard = height > 0;

  if (!hasKeyboard) return 0;
  return Platform.OS === 'ios' ? height : extra;
}

export function useKeyboardVisible(): boolean {
  const height = useKeyboardHeight();
  return height > 0;
}

/** برای دکمه‌های «بستن کیبورد» */
export function dismissKeyboard(): void {
  Keyboard.dismiss();
}

