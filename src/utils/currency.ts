import { onlyDigits, toPersianDigits } from './digits';

/** عدد را با جداکننده‌ی سه‌رقمی و ارقام لاتین برمی‌گرداند: 1250000 → "1,250,000" */
export function groupThousands(value: number): string {
  const safeValue = Number.isFinite(value) ? Math.trunc(value) : 0;
  const digits = Math.abs(safeValue).toString();

  let grouped = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) {
      grouped += ',';
    }
    grouped += digits[index];
  }

  return safeValue < 0 ? `-${grouped}` : grouped;
}

/** 1250000 → "۱,۲۵۰,۰۰۰" */
export function formatAmount(value: number): string {
  return toPersianDigits(groupThousands(value));
}

/** 1250000 → "۱,۲۵۰,۰۰۰ تومان" */
export function formatToman(value: number): string {
  return `${formatAmount(value)} تومان`;
}

/** 1250000 → "+۱,۲۵۰,۰۰۰" و ‎-1250000 → "−۱,۲۵۰,۰۰۰" (برای سود/زیان خالص) */
export function formatSignedAmount(value: number): string {
  const rounded = Math.trunc(value);
  if (rounded === 0) {
    return formatAmount(0);
  }
  return `${rounded > 0 ? '+' : '−'}${formatAmount(Math.abs(rounded))}`;
}

/** ورودی کاربر یا هر رشته‌ی شامل ارقام فارسی/لاتین را به عدد صحیح تبدیل می‌کند. */
export function parseAmount(input: string | number): number {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.trunc(input) : 0;
  }
  const digits = onlyDigits(input);
  return digits.length === 0 ? 0 : Number.parseInt(digits, 10);
}

/** مبلغ‌های خیلی بزرگ را برای کارت‌های کوچک خلاصه می‌کند: ۱۲.۵ میلیون */
export function formatShortAmount(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return `${toPersianDigits((absolute / 1_000_000_000).toFixed(1).replace('.', '٫'))} میلیارد`;
  }
  if (absolute >= 1_000_000) {
    return `${toPersianDigits((absolute / 1_000_000).toFixed(1).replace('.', '٫'))} میلیون`;
  }
  return formatAmount(value);
}
