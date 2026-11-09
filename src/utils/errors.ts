const PERSIAN_TEXT = /[\u0600-\u06FF]/;

/**
 * پیام خطای مناسب برای نمایش به کاربر.
 * خطاهای خودمان فارسی‌اند و همان‌طور نمایش داده می‌شوند؛ خطاهای سیستمی
 * (که معمولاً انگلیسی‌اند) با یک پیام فارسی عمومی جایگزین می‌شوند.
 */
export function toPersianErrorMessage(
  error: unknown,
  fallback = 'مشکلی پیش آمد. دوباره تلاش کن.',
): string {
  if (error instanceof Error && PERSIAN_TEXT.test(error.message)) {
    return error.message;
  }
  return fallback;
}
