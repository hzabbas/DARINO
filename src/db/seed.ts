import type { NewCategory, SqlDatabase } from '../types/models';

/**
 * دسته‌بندی‌های پیش‌فرض؛ فقط در اولین اجرا و وقتی جدول خالی است درج می‌شوند.
 * آیکون‌ها از مجموعه‌ی Ionicons انتخاب شده‌اند.
 */
export const DEFAULT_CATEGORIES: NewCategory[] = [
  // هزینه‌های خودرو
  { name: 'بنزین و سوخت خودرو', type: 'expense', icon: 'speedometer-outline', color: '#F97316' },
  { name: 'استهلاک خودرو', type: 'expense', icon: 'hourglass-outline', color: '#8B5CF6' },
  { name: 'تعمیرات و نگهداری خودرو', type: 'expense', icon: 'build-outline', color: '#0EA5E9' },
  { name: 'تعویض روغن و فیلتر', type: 'expense', icon: 'water-outline', color: '#EAB308' },
  { name: 'لاستیک و لوازم یدکی', type: 'expense', icon: 'disc-outline', color: '#64748B' },
  { name: 'کارواش', type: 'expense', icon: 'sparkles-outline', color: '#06B6D4' },

  // هزینه‌های روزمره
  { name: 'اینترنت', type: 'expense', icon: 'wifi-outline', color: '#3B82F6' },
  { name: 'شارژ تلفن همراه', type: 'expense', icon: 'phone-portrait-outline', color: '#22C55E' },
  { name: 'خوراک و مواد غذایی', type: 'expense', icon: 'restaurant-outline', color: '#EF4444' },
  { name: 'هزینه‌های شخصی', type: 'expense', icon: 'person-outline', color: '#EC4899' },
  { name: 'قبوض و هزینه‌های منزل', type: 'expense', icon: 'receipt-outline', color: '#F59E0B' },
  {
    name: 'سایر هزینه‌های متفرقه',
    type: 'expense',
    icon: 'ellipsis-horizontal-circle-outline',
    color: '#94A3B8',
  },

  // درآمدها
  {
    name: 'فعالیت در اسنپ (مسافرکشی روزانه)',
    type: 'income',
    icon: 'car-outline',
    color: '#10B981',
  },
  { name: 'حقوق و درآمد ماهانه', type: 'income', icon: 'wallet-outline', color: '#0D9488' },
  { name: 'سایر درآمدها', type: 'income', icon: 'add-circle-outline', color: '#84CC16' },
];

/**
 * اگر جدول دسته‌بندی خالی باشد، دسته‌بندی‌های پیش‌فرض را درج می‌کند.
 * خروجی: تعداد رکوردهای درج‌شده (صفر یعنی جدول از قبل پر بوده است).
 */
export function seedDefaultCategories(db: SqlDatabase): number {
  const row = db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM categories');
  if (row && row.total > 0) {
    return 0;
  }

  db.withTransactionSync(() => {
    for (const category of DEFAULT_CATEGORIES) {
      db.runSync(
        'INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)',
        category.name,
        category.type,
        category.icon,
        category.color,
      );
    }
  });

  return DEFAULT_CATEGORIES.length;
}
