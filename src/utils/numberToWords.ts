const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];

const TEENS = [
  'ده',
  'یازده',
  'دوازده',
  'سیزده',
  'چهارده',
  'پانزده',
  'شانزده',
  'هفده',
  'هجده',
  'نوزده',
];

const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];

const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];

const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد'];

function threeDigitsToWords(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;

  if (hundreds > 0) {
    parts.push(HUNDREDS[hundreds]);
  }

  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10]);
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    if (tens > 0) {
      parts.push(TENS[tens]);
    }
    if (ones > 0) {
      parts.push(ONES[ones]);
    }
  }

  return parts.join(' و ');
}

/** 350000 → «سیصد و پنجاه هزار» */
export function numberToPersianWords(value: number): string {
  const number = Math.trunc(Math.abs(Number.isFinite(value) ? value : 0));
  if (number === 0) {
    return 'صفر';
  }

  const groups: number[] = [];
  let remaining = number;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  if (groups.length > SCALES.length) {
    return 'عدد بسیار بزرگ';
  }

  const parts: string[] = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) {
      continue;
    }

    const words = threeDigitsToWords(group);
    if (index === 0) {
      parts.push(words);
    } else if (index === 1 && group === 1) {
      // ۱۰۰۰ → «هزار» نه «یک هزار»
      parts.push(SCALES[1]);
    } else {
      parts.push(`${words} ${SCALES[index]}`);
    }
  }

  return parts.join(' و ');
}

/** 350000 → «سیصد و پنجاه هزار تومان» */
export function formatAmountInWords(value: number): string {
  return `${numberToPersianWords(value)} تومان`;
}
