import { stripDirectionalMarks } from './bidi';

/**
 * بانک‌ها و نئوبانک‌های ایران.
 *
 * `senders` سرشماره‌های پیش‌فرضی است که پیامک بانکی از آن‌ها می‌آید؛ کاربر می‌تواند
 * در صفحه‌ی حساب‌ها هر سرشماره‌ی دیگری را هم به حساب اضافه کند.
 */
export interface IranianBank {
  code: string;
  name: string;
  englishName: string;
  /** رنگ سازمانی برای نشان و نمودارها */
  color: string;
  /** حروف کوتاه داخل نشان */
  badge: string;
  senders: string[];
  /** کلمه‌های داخل متن پیامک که به شناسایی بانک کمک می‌کند */
  hints?: string[];
}

export const IRANIAN_BANKS: IranianBank[] = [
  {
    code: 'blu',
    name: 'بلوبانک',
    englishName: 'Blu Bank',
    color: '#0EA5E9',
    badge: 'بلو',
    senders: ['09999987641', '+989999987641', 'Blu', 'BLU'],
    hints: ['بلو'],
  },
  {
    code: 'pasargad',
    name: 'بانک پاسارگاد',
    englishName: 'Bank Pasargad',
    color: '#1E3A8A',
    badge: 'پاس',
    senders: ['B.Pasargad', 'BPASARGAD', 'PASARGAD', '2000777'],
  },
  {
    code: 'mehr',
    name: 'قرض‌الحسنه مهر ایران',
    englishName: 'Mehr Iran Bank',
    color: '#16A34A',
    badge: 'مهر',
    senders: ['B.QMEHRIRAN', 'QMEHRIRAN', '30008310'],
    hints: ['مهر ایران', 'قرض‌الحسنه'],
  },
  {
    code: 'mellat',
    name: 'بانک ملت',
    englishName: 'Bank Mellat',
    color: '#C8102E',
    badge: 'ملت',
    senders: ['B.MELLAT', 'BANKMELLAT', 'MELLAT'],
    hints: ['ملت'],
  },
  {
    code: 'melli',
    name: 'بانک ملی ایران',
    englishName: 'Bank Melli Iran',
    color: '#1D4ED8',
    badge: 'ملی',
    senders: ['B.MELLI', 'BANKMELLI', 'MELLI'],
    hints: ['ملی ایران', 'بانک ملی'],
  },
  {
    code: 'saderat',
    name: 'بانک صادرات ایران',
    englishName: 'Bank Saderat Iran',
    color: '#0F766E',
    badge: 'صادر',
    senders: ['B.SADERAT', 'SADERAT'],
    hints: ['صادرات'],
  },
  {
    code: 'tejarat',
    name: 'بانک تجارت',
    englishName: 'Bank Tejarat',
    color: '#1E40AF',
    badge: 'تج',
    senders: ['B.TEJARAT', 'TEJARAT'],
    hints: ['تجارت'],
  },
  {
    code: 'sepah',
    name: 'بانک سپه',
    englishName: 'Bank Sepah',
    color: '#7C3AED',
    badge: 'سپه',
    senders: ['B.SEPAH', 'SEPAH'],
    hints: ['سپه'],
  },
  {
    code: 'keshavarzi',
    name: 'بانک کشاورزی',
    englishName: 'Bank Keshavarzi',
    color: '#15803D',
    badge: 'کش',
    senders: ['B.KESHAVARZI', 'KESHAVARZI'],
    hints: ['کشاورزی'],
  },
  {
    code: 'maskan',
    name: 'بانک مسکن',
    englishName: 'Bank Maskan',
    color: '#0369A1',
    badge: 'مسکن',
    senders: ['B.MASKAN', 'MASKAN'],
    hints: ['مسکن'],
  },
  {
    code: 'saman',
    name: 'بانک سامان',
    englishName: 'Saman Bank',
    color: '#0F172A',
    badge: 'سامان',
    senders: ['B.SAMAN', 'SAMAN'],
    hints: ['سامان'],
  },
  {
    code: 'parsian',
    name: 'بانک پارسیان',
    englishName: 'Parsian Bank',
    color: '#B45309',
    badge: 'پارسیان',
    senders: ['B.PARSIAN', 'PARSIAN'],
    hints: ['پارسیان'],
  },
  {
    code: 'enovin',
    name: 'بانک اقتصاد نوین',
    englishName: 'EN Bank',
    color: '#0284C7',
    badge: 'نوین',
    senders: ['B.ENOVIN', 'ENOVIN', 'ENBANK'],
    hints: ['اقتصاد نوین'],
  },
  {
    code: 'resalat',
    name: 'بانک قرض‌الحسنه رسالت',
    englishName: 'Resalat Bank',
    color: '#22C55E',
    badge: 'رسالت',
    senders: ['B.RESALAT', 'RESALAT'],
    hints: ['رسالت'],
  },
  {
    code: 'ayandeh',
    name: 'بانک آینده',
    englishName: 'Ayandeh Bank',
    color: '#6D28D9',
    badge: 'آینده',
    senders: ['B.AYANDEH', 'AYANDEH'],
    hints: ['آینده'],
  },
  {
    code: 'shahr',
    name: 'بانک شهر',
    englishName: 'Bank Shahr',
    color: '#7E22CE',
    badge: 'شهر',
    senders: ['B.SHAHR', 'SHAHR'],
    hints: ['بانک شهر'],
  },
  {
    code: 'refah',
    name: 'بانک رفاه کارگران',
    englishName: 'Refah Bank',
    color: '#2563EB',
    badge: 'رفاه',
    senders: ['B.REFAH', 'REFAH'],
    hints: ['رفاه'],
  },
  {
    code: 'sina',
    name: 'بانک سینا',
    englishName: 'Sina Bank',
    color: '#0D9488',
    badge: 'سینا',
    senders: ['B.SINA', 'SINA'],
    hints: ['سینا'],
  },
  {
    code: 'gardeshgari',
    name: 'بانک گردشگری',
    englishName: 'Tourism Bank',
    color: '#EA580C',
    badge: 'گردش',
    senders: ['B.GARDESHGARI', 'GARDESHGARI'],
    hints: ['گردشگری'],
  },
  {
    code: 'khavarmiane',
    name: 'بانک خاورمیانه',
    englishName: 'Middle East Bank',
    color: '#0F766E',
    badge: 'خاور',
    senders: ['B.KHAVARM', 'MIDDLEEAST', 'KHAVARM'],
    hints: ['خاورمیانه'],
  },
  {
    code: 'karafarin',
    name: 'بانک کارآفرین',
    englishName: 'Karafarin Bank',
    color: '#1D4ED8',
    badge: 'کار',
    senders: ['B.KARAFARIN', 'KARAFARIN'],
    hints: ['کارآفرین'],
  },
  {
    code: 'day',
    name: 'بانک دی',
    englishName: 'Day Bank',
    color: '#9333EA',
    badge: 'دی',
    senders: ['B.DAY', 'DAYBANK'],
    hints: ['بانک دی'],
  },
  {
    code: 'postbank',
    name: 'پست بانک ایران',
    englishName: 'Post Bank',
    color: '#F59E0B',
    badge: 'پست',
    senders: ['B.POSTBANK', 'POSTBANK'],
    hints: ['پست بانک'],
  },
  {
    code: 'wipad',
    name: 'ویپاد (ترابانک پاسارگاد)',
    englishName: 'Wipad',
    color: '#7C3AED',
    badge: 'ویپاد',
    senders: ['WIPAD', 'B.WIPAD', 'TRABANK'],
    hints: ['ویپاد', 'ترابانک'],
  },
  {
    code: 'bankino',
    name: 'بانکینو',
    englishName: 'Bankino',
    color: '#0EA5E9',
    badge: 'بینو',
    senders: ['BANKINO', 'B.BANKINO'],
    hints: ['بانکینو'],
  },
  {
    code: 'other',
    name: 'سایر بانک‌ها / حساب سفارشی',
    englishName: 'Other / Custom',
    color: '#64748B',
    badge: '؟',
    senders: [],
  },
];

export const DEFAULT_BANK = 'other';

export function getBank(code: string | null | undefined): IranianBank {
  return IRANIAN_BANKS.find((bank) => bank.code === code) ?? IRANIAN_BANKS[IRANIAN_BANKS.length - 1];
}

/** کاراکترهای نامرئی و جداکننده‌هایی که در مقایسه‌ی سرشماره‌ها نادیده گرفته می‌شوند. */
const SENDER_NOISE_PATTERN = /[\s\-_\u200b-\u200f\u202a-\u202e\u2066-\u2069\u00ad\u00a0\ufeff]/g;

/**
 * سرشماره را برای مقایسه یکدست می‌کند:
 *
 *   «B.Pasargad» → «b.pasargad»
 *   «0999 998 7641» → «0999987641»
 *   «+98 999 998 7641» → «09999987641»
 *   «00989999987641» → «09999987641»
 *   «989999987641» → «099999987641»
 *
 * قاعده: پیشوندهای ایران (+98، 0098، 98) همیشه به «0» تبدیل می‌شوند تا یک شماره
 * با هر شکلی که ذخیره شده باشد (با کد کشور، با صفر، بدون صفر) با هم مطابقت کند.
 * این تابع باید با `SmsSender.normalize` در Kotlin یکی بماند.
 */
export function normalizeSender(sender: string): string {
  const base = stripDirectionalMarks(sender ?? '')
    .trim()
    .toLowerCase()
    .replace(SENDER_NOISE_PATTERN, '');

  if (!base) return '';
  if (base.startsWith('+98')) return `0${base.slice(3)}`;
  if (base.startsWith('0098')) return `0${base.slice(4)}`;
  if (/^98\d{10}$/.test(base)) return `0${base.slice(2)}`;
  return base;
}

/**
 * شکل‌های ممکن یک سرشماره در دفتر پیامک گوشی.
 *
 * کاربر ممکن است «09999987641» را ذخیره کرده باشد ولی بانک پیامک را از
 * «+989999987641» بفرستد؛ برای کوئری `address IN (…)` هر دو شکل لازم است.
 */
export function senderVariants(sender: string): string[] {
  const raw = stripDirectionalMarks(sender ?? '').trim();
  if (!raw) return [];

  const normalized = normalizeSender(raw);
  const variants = new Set<string>([raw]);
  if (normalized) variants.add(normalized);

  const national = normalized.match(/^0(\d{10})$/);
  if (national) {
    variants.add(`+98${national[1]}`);
    variants.add(`98${national[1]}`);
    variants.add(`0098${national[1]}`);
  }

  return [...variants];
}

/**
 * آیا این دو سرشماره به یک حساب تعلق دارند؟
 *
 * شماره‌ها فقط بعد از نرمال‌سازی دقیق مقایسه می‌شوند (تا دو شماره‌ی مختلف با
 * پسوند مشترک قاطی نشوند)، ولی سرشماره‌های متنی می‌توانند هم‌پوشانی داشته باشند
 * («B.Pasargad» با «Pasargad»).
 */
export function sendersMatch(first: string, second: string): boolean {
  const left = normalizeSender(first);
  const right = normalizeSender(second);
  if (!left || !right) return false;
  if (left === right) return true;

  if (/^\d+$/.test(left) || /^\d+$/.test(right)) return false;

  if (left.length >= 5 && right.includes(left)) return true;
  if (right.length >= 5 && left.includes(right)) return true;
  return false;
}


/**
 * بانک را از روی فرستنده (و در صورت نیاز متن) تشخیص می‌دهد.
 * اولویت با سرشماره‌ی دقیق است؛ بعد سرشماره‌ی شروع‌شده با الگوی بانک.
 */
export function detectBankFromSender(sender: string, body = ''): IranianBank | null {
  const normalized = normalizeSender(sender);

  for (const bank of IRANIAN_BANKS) {
    for (const pattern of bank.senders) {
      const normalizedPattern = normalizeSender(pattern);
      if (!normalizedPattern) continue;
      if (normalized === normalizedPattern) return bank;
    }
  }

  for (const bank of IRANIAN_BANKS) {
    for (const pattern of bank.senders) {
      const normalizedPattern = normalizeSender(pattern);
      if (normalizedPattern.length >= 4 && normalized.includes(normalizedPattern)) return bank;
    }
  }

  const text = body.replace(/\u200c/g, ' ');
  for (const bank of IRANIAN_BANKS) {
    for (const hint of bank.hints ?? []) {
      if (text.includes(hint)) return bank;
    }
  }

  return null;
}
