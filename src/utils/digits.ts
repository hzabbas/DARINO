const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

/** Convert Latin digits to Persian digits. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/** Convert Persian and Arabic digits to Latin digits. */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit as (typeof PERSIAN_DIGITS)[number])))
    .replace(/[٠-٩]/g, (digit) =>
      String(ARABIC_INDIC_DIGITS.indexOf(digit as (typeof ARABIC_INDIC_DIGITS)[number])),
    );
}

/** Extract only Latin digits from string. */
export function onlyDigits(input: string): string {
  return toLatinDigits(input).replace(/[^0-9]/g, '');
}
