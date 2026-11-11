import { Platform, Share } from 'react-native';

/**
 * اشتراک‌گذاری متن؛ روی وب به کلیپ‌بورد برمی‌گردد چون Web Share در همه‌ی مرورگرها نیست.
 * خروجی مشخص می‌کند چه اتفاقی افتاد تا صفحه بتواند پیام مناسب نشان دهد.
 */
export async function shareText(title: string, message: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title, text: message });
        return 'shared';
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        return 'copied';
      }
    } catch {
      // کاربر انصراف داده یا مرورگر اجازه نداده
    }
    return 'failed';
  }

  try {
    const result = await Share.share({ title, message });
    return result.action === Share.dismissedAction ? 'failed' : 'shared';
  } catch {
    return 'failed';
  }
}
