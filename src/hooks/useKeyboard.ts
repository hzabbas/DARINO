import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  type KeyboardEvent,
  type LayoutChangeEvent,
} from 'react-native';

import {
  computeSheetKeyboardMetrics,
  contentKeyboardPadding,
  type SheetKeyboardMetrics,
} from '../utils/keyboard';

export interface KeyboardState {
  /** Keyboard height in pixels; 0 when hidden. */
  keyboardHeight: number;
  isKeyboardVisible: boolean;
}

/**
 * Hook to track keyboard height and visibility across platforms.
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

/**
 * Content padding for scroll views based on keyboard state.
 */
export function useKeyboardPadding(inModal = false): number {
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();

  return contentKeyboardPadding({
    keyboardHeight,
    isKeyboardVisible,
    platform: Platform.OS,
    inModal,
  });
}

export interface SheetKeyboardState extends SheetKeyboardMetrics {
  /** Attach to sheet container or backdrop for layout measurement. */
  onLayout: (event: LayoutChangeEvent) => void;
}

/**
 * Bottom sheet keyboard handling for modals.
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
      // Estimate window height before initial layout event.
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
