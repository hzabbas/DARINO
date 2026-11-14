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

// ---------------------------------------------------------------------------
// اعداد محاوره‌ای برای «اعلام صوتی واریز»
//
// این خروجی هیچ‌وقت روی صفحه نمایش داده نمی‌شود؛ فقط خوانده می‌شود. پس عمداً
// همان شکل گفتاری روزمره‌ی ایرانی نوشته می‌شود («صد» نه «یکصد»، «پونصد» نه
// «پانصد»، «پونزده» نه «پانزده») تا گوینده‌ی طبیعی آن را خودی و انسانی بخواند.
// ---------------------------------------------------------------------------

const COLLOQUIAL_TEENS = [
  'ده',
  'یازده',
  'دوازده',
  'سیزده',
  'چهارده',
  'پونزده',
  'شونزده',
  'هیفده',
  'هیجده',
  'نوزده',
];

const COLLOQUIAL_HUNDREDS = [
  '',
  'صد',
  'دویست',
  'سیصد',
  'چهارصد',
  'پونصد',
  'ششصد',
  'هفتصد',
  'هشتصد',
  'نهصد',
];

function colloquialThreeDigits(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;

  if (hundreds > 0) {
    parts.push(COLLOQUIAL_HUNDREDS[hundreds]);
  }

  if (rest >= 10 && rest < 20) {
    parts.push(COLLOQUIAL_TEENS[rest - 10]);
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

function colloquialNumberToWords(value: number): string {
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

    const words = colloquialThreeDigits(group);
    if (index === 0) {
      parts.push(words);
    } else if (index === 1 && group === 1) {
      parts.push(SCALES[1]);
    } else {
      parts.push(`${words} ${SCALES[index]}`);
    }
  }

  return parts.join(' و ');
}

/**
 * مبلغ تومانی را همان‌طور می‌نویسد که در گفتار روزمره گفته می‌شود؛ **بدون**
 * کلمه‌ی «تومن».
 *
 * قاعده‌ها:
 *  - بین ۱٬۰۰۰ تا ۹۹۹٬۰۰۰ تومان که بر هزار بخش‌پذیر است، «هزار» حذف می‌شود:
 *    `70000 → "هفتاد"`، `120000 → "صد و بیست"`، `85000 → "هشتاد و پنج"`
 *  - اگر باقی‌مانده ۵۰۰ باشد: `75500 → "هفتاد و پنج و پونصد"`
 *  - میلیون و بالاتر کامل خوانده می‌شود: `1000000 → "یک میلیون"`،
 *    `1200000 → "یک میلیون و دویست هزار"`
 */
export function formatColloquialSpeechAmount(amountToman: number): string {
  const amount = Math.trunc(Math.abs(Number.isFinite(amountToman) ? amountToman : 0));

  if (amount >= 1_000 && amount < 1_000_000) {
    const remainder = amount % 1_000;
    if (remainder === 0) {
      return colloquialNumberToWords(amount / 1_000);
    }
    if (remainder === 500) {
      return `${colloquialNumberToWords(Math.floor(amount / 1_000))} و پونصد`;
    }
  }

  return colloquialNumberToWords(amount);
}

/**
 * جمله‌ی کامل اعلام واریز با لحن خودمانی؛ باید دقیقاً با نسخه‌ی Kotlin یکی بماند.
 *
 *  - با نام واریزکننده: «علی محمدی، هفتاد تومن برات واریز کرد»
 *  - بدون نام: «هفتاد تومن برات واریز شد»
 */
export function buildColloquialDepositSpeech(
  amountToman: number,
  payerName?: string | null,
): string {
  const amountText = formatColloquialSpeechAmount(amountToman);
  const name = payerName?.trim();
  if (name) {
    return `${name}، ${amountText} تومن برات واریز کرد`;
  }
  return `${amountText} تومن برات واریز شد`;
}
