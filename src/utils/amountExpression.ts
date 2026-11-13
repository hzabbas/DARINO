import { toLatinDigits } from './digits';

export interface AmountExpressionResult {
  /** مقدار نهایی؛ ۰ اگر ورودی خالی یا نامعتبر باشد */
  value: number;
  /** آیا عبارت شامل + یا − است */
  isExpression: boolean;
  /** پیام فارسی خطا، یا null */
  error: string | null;
}

const MAX_AMOUNT = 999_999_999_999;

/**
 * ماشین‌حساب ساده‌ی فیلد مبلغ.
 *
 * فقط عدد، جمع و تفریق پذیرفته می‌شود (نه eval، نه پرانتز) تا ورودی کاربر
 * نتواند کدی اجرا کند. ارقام فارسی/عربی و جداکننده‌ها هم قبل از محاسبه
 * نرمال می‌شوند.
 */
export function evaluateAmountExpression(input: string): AmountExpressionResult {
  const normalized = toLatinDigits(input)
    .replace(/[\s,٬،_]/g, '')
    .replace(/[\u2212\u2010\u2011\u2013\u2014\uFF0D]/g, '-')
    .replace(/[\uFF0B\uFE62]/g, '+');
  if (!normalized) {
    return { value: 0, isExpression: false, error: null };
  }

  const isExpression = /[+-]/.test(normalized);
  if (!/^[0-9+-]+$/.test(normalized)) {
    return { value: 0, isExpression, error: 'فقط عدد، + و − مجاز است' };
  }
  if (/^[+-]/.test(normalized) || /[+-]$/.test(normalized) || /[+-]{2,}/.test(normalized)) {
    return { value: 0, isExpression, error: 'عبارت ناقص است؛ مثلاً 450000+120000' };
  }

  const parts = normalized.split(/([+-])/);
  let total = Number(parts[0]);
  if (!Number.isFinite(total) || total > MAX_AMOUNT) {
    return { value: 0, isExpression, error: 'مبلغ وارد شده خیلی بزرگ است' };
  }

  for (let index = 1; index < parts.length; index += 2) {
    const operator = parts[index];
    const operandText = parts[index + 1] ?? '';
    const operand = Number(operandText);
    if (!Number.isFinite(operand) || operand > MAX_AMOUNT) {
      return { value: 0, isExpression, error: 'مبلغ وارد شده خیلی بزرگ است' };
    }
    total = operator === '+' ? total + operand : total - operand;
    if (total < 0) {
      return { value: 0, isExpression, error: 'نتیجه منفی است' };
    }
    if (total > MAX_AMOUNT) {
      return { value: 0, isExpression, error: 'مبلغ وارد شده خیلی بزرگ است' };
    }
  }

  return { value: Math.trunc(total), isExpression, error: null };
}
