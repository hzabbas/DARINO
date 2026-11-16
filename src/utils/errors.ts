const PERSIAN_TEXT = /[\u0600-\u06FF]/;

/**
 * Return friendly Persian error message, falling back to default on system errors.
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
