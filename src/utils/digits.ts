const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

/** هر رقم لاتین را به رقم فارسی تبدیل می‌کند و بقیه‌ی کاراکترها را دست نمی‌زند. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/**
 * ارقام فارسی و عربی را به لاتین برمی‌گرداند.
 * برای خواندن ورودی کاربر (مبلغ) لازم است، چون کیبورد فارسی ارقام فارسی می‌فرستد.
 */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit as (typeof PERSIAN_DIGITS)[number])))
    .replace(/[٠-٩]/g, (digit) =>
      String(ARABIC_INDIC_DIGITS.indexOf(digit as (typeof ARABIC_INDIC_DIGITS)[number])),
    );
}

/** فقط ارقام لاتین ورودی را نگه می‌دارد؛ برای فیلدهای عددی. */
export function onlyDigits(input: string): string {
  return toLatinDigits(input).replace(/[^0-9]/g, '');
}
