import { onlyDigits, toPersianDigits } from './digits';

/** Group thousands with commas in Latin digits: 1250000 -> "1,250,000" */
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

/** Format number with thousands separator and Persian digits. */
export function formatAmount(value: number): string {
  return toPersianDigits(groupThousands(value));
}

/** Format amount with Toman suffix. */
export function formatToman(value: number): string {
  return `${formatAmount(value)} تومان`;
}

/** Format signed amount with plus/minus prefix. */
export function formatSignedAmount(value: number): string {
  const rounded = Math.trunc(value);
  if (rounded === 0) {
    return formatAmount(0);
  }
  return `${rounded > 0 ? '+' : '−'}${formatAmount(Math.abs(rounded))}`;
}

/** Parse string or number into integer amount. */
export function parseAmount(input: string | number): number {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.trunc(input) : 0;
  }
  const digits = onlyDigits(input);
  return digits.length === 0 ? 0 : Number.parseInt(digits, 10);
}

/** Abbreviate large numbers for compact cards (million / billion). */
export function formatShortAmount(value: number): string {
  const sign = value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return `${sign}${toPersianDigits((absolute / 1_000_000_000).toFixed(1).replace('.', '٫'))} میلیارد`;
  }
  if (absolute >= 1_000_000) {
    return `${sign}${toPersianDigits((absolute / 1_000_000).toFixed(1).replace('.', '٫'))} میلیون`;
  }
  return value < 0 ? `${sign}${formatAmount(absolute)}` : formatAmount(value);
}
