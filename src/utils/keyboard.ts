/**
 * حساب‌های خالص هندسه‌ی کیبورد.
 *
 * این توابع هیچ وابستگی‌ای به react-native ندارند تا با `node:test` قابل تست باشند؛
 * هوک‌های `useKeyboard` فقط اندازه‌گیری‌ها را به این‌ها می‌دهند.
 *
 * قاعده‌ی اصلی: روی اندروید وقتی پنجره با `adjustResize` خودش کوچک می‌شود
 * (اکتیویتی یا دیالوگ مجارش‌شده) نباید ارتفاع کیبورد را دوباره به عنوان فاصله
 * اضافه کنیم؛ وگرنه محتوا دو برابر جابه‌جا می‌شود.
 */
export type PlatformName = 'ios' | 'android' | 'web' | string;

/** کمترین ارتفاع مجاز شیت تا همیشه قابل استفاده بماند. */
export const MIN_SHEET_HEIGHT = 260;

/** فاصله‌ی امن بالای شیت تا سربرگ زیر نوتیف‌بار/بریدگی نرود. */
export const SHEET_TOP_GAP = 24;

/** بیشتر از این مقدار کوتاه‌شدن ارتفاع = پنجره خودش با adjustResize کوچک شده است. */
export const RESIZE_THRESHOLD = 40;

export interface SheetKeyboardMetrics {
  /** ارتفاع واقعی کیبورد (۰ یعنی بسته) */
  keyboardHeight: number;
  isKeyboardVisible: boolean;
  /** مقداری که باید به پایین شیت (یا overlay) اضافه شود تا بالای کیبورد بیفتد */
  lift: number;
  /** بیشترین ارتفاع مجاز شیت تا سربرگ بیرون از صفحه نرود */
  maxHeight: number;
  /** ارتفاع قابل استفاده برای اسکرول محتوای شیت */
  availableHeight: number;
  /** آیا پنجره خودش کوچک شده (پس نباید جا باز کنیم) */
  resized: boolean;
}

export interface SheetKeyboardInput {
  /** ارتفاع اندازه‌گیری‌شده‌ی overlay شیت؛ ۰ یعنی هنوز اندازه‌گیری نشده */
  containerHeight: number;
  /** بلندترین ارتفاعی که overlay وقتی کیبورد بسته بود داشته */
  baselineHeight: number;
  keyboardHeight: number;
  isKeyboardVisible: boolean;
  /** فاصله‌ی بالای صفحه (safe area top) */
  topInset: number;
  platform: PlatformName;
}

/** آیا پنجره به‌خاطر کیبورد خودش کوتاه شده است؟ */
export function isWindowResized(
  containerHeight: number,
  baselineHeight: number,
  threshold = RESIZE_THRESHOLD,
): boolean {
  if (containerHeight <= 0 || baselineHeight <= 0) return false;
  return containerHeight <= baselineHeight - threshold;
}

/** هندسه‌ی کامل شیت بر اساس اندازه‌گیری‌ها. */
export function computeSheetKeyboardMetrics(input: SheetKeyboardInput): SheetKeyboardMetrics {
  const { containerHeight, baselineHeight, keyboardHeight, topInset, platform } = input;
  const isWeb = platform === 'web';
  const visible = !isWeb && input.isKeyboardVisible && keyboardHeight > 0;

  // اگر اندازه‌گیری نشده باشد، به بلندترین ارتفاع دیده‌شده تکیه می‌کنیم
  const height = containerHeight > 0 ? containerHeight : baselineHeight;

  const resized = visible && isWindowResized(containerHeight, baselineHeight);

  // روی iOS پنجره هرگز کوچک نمی‌شود؛ روی اندروید فقط وقتی خودش کوچک نشده باشد
  // ارتفاع کیبورد را به عنوان فاصله اضافه می‌کنیم.
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
  /**
   * آیا محتوا داخل یک `<Modal>` بومی است؟
   *
   * روی اندروید پنجره‌ی `Modal` از `adjustResize` اکتیویتی پیروی نمی‌کند و زیر
   * کیبورد می‌ماند؛ پس فقط در مودال باید خودمان جا باز کنیم.
   */
  inModal?: boolean;
}

/**
 * فاصله‌ی پایین محتوای صفحه‌های اسکرولی.
 *
 * - iOS: به اندازه‌ی کیبورد.
 * - اندروید بیرون از مودال: صفر؛ چون `softwareKeyboardLayoutMode: "resize"` خودِ
 *   پنجره را کوچک می‌کند و هر padding دیگری «فاصله‌ی دوباره» است.
 * - اندروید داخل مودال: به اندازه‌ی کیبورد، چون دیالوگ بومی resize نمی‌شود.
 */
export function contentKeyboardPadding(input: ContentKeyboardPaddingInput): number {
  const { keyboardHeight, isKeyboardVisible, platform, inModal = false } = input;
  if (platform === 'web' || !isKeyboardVisible || keyboardHeight <= 0) return 0;
  if (platform === 'ios') return keyboardHeight;
  return inModal ? keyboardHeight : 0;
}
