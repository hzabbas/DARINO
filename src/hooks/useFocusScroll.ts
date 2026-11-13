import { createContext, useCallback, useContext, useRef, type RefObject } from 'react';
import {
  findNodeHandle,
  Platform,
  TextInput,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

export interface FocusScroll {
  /** روی ScrollView بگذارید */
  scrollRef: RefObject<ScrollViewInstance | null>;
  /** روی onFocus هر TextInput بگذارید تا خودش را بالای کیبورد بیاورد */
  onFocus: (event?: NativeSyntheticEvent<unknown>) => void;
  /** مستقیم یک نود را اسکرول می‌کند */
  scrollInputIntoView: (target?: unknown) => void;
}

/** فاصله‌ی امنی که بین فیلد و بالای کیبورد می‌ماند. */
export const FOCUS_SCROLL_OFFSET = 36;

function resolveNodeHandle(target: unknown): number | null {
  if (target == null) return null;
  if (typeof target === 'number') return target;
  try {
    return findNodeHandle(target as never) ?? null;
  } catch {
    return null;
  }
}

/**
 * ورودی فوکوس‌شده (یا نودی که رویداد از آن آمده) را داخل ScrollView
 * بالای کیبورد می‌آورد.
 *
 * `scrollResponderScrollNativeHandleToKeyboard` یک متد آماده‌ی ScrollView است که
 * مختصات نود را نسبت به خودش می‌سنجد و اسکرول می‌کند؛ پس روی اندروید (که پنجره
 * خودش resize می‌شود) هم دو بار جابه‌جا نمی‌کند.
 */
export function useFocusScroll(offset = FOCUS_SCROLL_OFFSET): FocusScroll {
  const scrollRef = useRef<ScrollViewInstance | null>(null);

  const scrollInputIntoView = useCallback(
    (target?: unknown) => {
      const responder = scrollRef.current;
      if (!responder?.scrollResponderScrollNativeHandleToKeyboard) return;

      const focused = TextInput.State.currentlyFocusedInput?.() ?? null;
      const handle = resolveNodeHandle(target) ?? resolveNodeHandle(focused);
      if (!handle) return;

      responder.scrollResponderScrollNativeHandleToKeyboard(handle, offset, true);
    },
    [offset],
  );

  const onFocus = useCallback(
    (event?: NativeSyntheticEvent<unknown>) => {
      const nativeTarget = (event?.nativeEvent as { target?: number } | undefined)?.target;
      const target = nativeTarget ?? event?.target ?? null;

      // یک تیک صبر می‌کنیم تا کیبورد باز شود و چیدمان نهایی شود
      setTimeout(() => scrollInputIntoView(target), Platform.OS === 'android' ? 140 : 70);
    },
    [scrollInputIntoView],
  );

  return { scrollRef, onFocus, scrollInputIntoView };
}

/**
 * دسترسی کامپوننت‌های فرزند (مثل TransactionForm) به اسکرول صفحه‌ی والد
 * بدون اینکه لازم باشد ref دستی پاس داده شود.
 */
export const ScreenScrollContext = createContext<FocusScroll | null>(null);

export function useScreenFocusScroll(): FocusScroll | null {
  return useContext(ScreenScrollContext);
}
