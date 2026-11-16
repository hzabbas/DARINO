/**
 * Pure keyboard geometry calculations.
 */
export type PlatformName = 'ios' | 'android' | 'web' | string;

/** Minimum allowed sheet height in pixels. */
export const MIN_SHEET_HEIGHT = 260;

/** Safe top gap for sheet beneath status bar / notch. */
export const SHEET_TOP_GAP = 24;

/** Height reduction threshold to detect window resize by adjustResize. */
export const RESIZE_THRESHOLD = 40;

export interface SheetKeyboardMetrics {
  /** Keyboard height in pixels (0 if closed). */
  keyboardHeight: number;
  isKeyboardVisible: boolean;
  /** Vertical lift to apply to sheet above keyboard. */
  lift: number;
  /** Max permissible sheet height. */
  maxHeight: number;
  /** Available scroll height inside sheet. */
  availableHeight: number;
  /** True if window itself was resized by system. */
  resized: boolean;
}

export interface SheetKeyboardInput {
  /** Measured container overlay height; 0 before measurement. */
  containerHeight: number;
  /** Tallest height observed while keyboard was closed. */
  baselineHeight: number;
  keyboardHeight: number;
  isKeyboardVisible: boolean;
  /** Safe area top inset. */
  topInset: number;
  platform: PlatformName;
}

/** Check if window was resized by software keyboard. */
export function isWindowResized(
  containerHeight: number,
  baselineHeight: number,
  threshold = RESIZE_THRESHOLD,
): boolean {
  if (containerHeight <= 0 || baselineHeight <= 0) return false;
  return containerHeight <= baselineHeight - threshold;
}

/** Compute sheet keyboard geometry metrics. */
export function computeSheetKeyboardMetrics(input: SheetKeyboardInput): SheetKeyboardMetrics {
  const { containerHeight, baselineHeight, keyboardHeight, topInset, platform } = input;
  const isWeb = platform === 'web';
  const visible = !isWeb && input.isKeyboardVisible && keyboardHeight > 0;

  // Use baseline height if container is not measured yet.
  const height = containerHeight > 0 ? containerHeight : baselineHeight;

  const resized = visible && isWindowResized(containerHeight, baselineHeight);

  // Apply lift only if window was not already resized by system.
  const lift = visible ? (platform === 'ios' || !resized ? keyboardHeight : 0) : 0;

  const availableHeight = Math.max(MIN_SHEET_HEIGHT, height - lift - topInset - SHEET_TOP_GAP);

  return {
    keyboardHeight: visible ? keyboardHeight : 0,
    isKeyboardVisible: visible,
    lift,
    maxHeight: availableHeight,
    availableHeight,
    resized,
  };
}

export interface ContentKeyboardPaddingInput {
  keyboardHeight: number;
  isKeyboardVisible: boolean;
  platform: PlatformName;
  /** True if content is rendered inside native Modal. */
  inModal?: boolean;
}

/**
 * Bottom padding calculation for scrollable screens.
 */
export function contentKeyboardPadding(input: ContentKeyboardPaddingInput): number {
  const { keyboardHeight, isKeyboardVisible, platform, inModal = false } = input;
  if (platform === 'web' || !isKeyboardVisible || keyboardHeight <= 0) return 0;
  if (platform === 'ios') return keyboardHeight;
  return inModal ? keyboardHeight : 0;
}
