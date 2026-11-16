import { Alert, Platform } from 'react-native';

/**
 * Native alert and confirmation dialog helpers with web fallback.
 */
const isWeb = Platform.OS === 'web';

export function notify(title: string, message?: string): void {
  if (isWeb) {
    if (typeof window !== 'undefined') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function confirmAction({
  title,
  message,
  confirmLabel = 'تأیید',
  cancelLabel = 'انصراف',
  destructive = false,
  onConfirm,
}: ConfirmOptions): void {
  if (isWeb) {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
