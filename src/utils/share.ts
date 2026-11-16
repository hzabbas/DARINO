import { Platform, Share } from 'react-native';

/**
 * Share text with native share sheet, falling back to clipboard on web.
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
      // User cancelled or clipboard permission denied.
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
