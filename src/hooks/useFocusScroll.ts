import { createContext, useCallback, useContext, useRef, type RefObject } from 'react';
import {
  findNodeHandle,
  Platform,
  TextInput,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

export interface FocusScroll {
  /** Attach to ScrollView ref. */
  scrollRef: RefObject<ScrollViewInstance | null>;
  /** Attach to TextInput onFocus to scroll field into view. */
  onFocus: (event?: NativeSyntheticEvent<unknown>) => void;
  /** Scroll target node into view directly. */
  scrollInputIntoView: (target?: unknown) => void;
}

/** Safe offset between input and keyboard top edge. */
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
 * Scroll focused TextInput into view inside ScrollView above keyboard.
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

      // Wait a tick for keyboard animation layout completion.
      setTimeout(() => scrollInputIntoView(target), Platform.OS === 'android' ? 140 : 70);
    },
    [scrollInputIntoView],
  );

  return { scrollRef, onFocus, scrollInputIntoView };
}

/**
 * Context to share parent screen focus scroll with child components.
 */
export const ScreenScrollContext = createContext<FocusScroll | null>(null);

export function useScreenFocusScroll(): FocusScroll | null {
  return useContext(ScreenScrollContext);
}
