import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '../db/DatabaseProvider';
import { colors, fonts } from '../theme';

/**
 * راست‌به‌چپ: در بیلد نیتیو، پلاگین expo-localization این کار را در مانیفست انجام می‌دهد.
 * این دو خط برای اجرا در Expo Go و همچنین اطمینان از اعمال RTL در اجرای اول است.
 * (اعمال کامل جهت چیدمان بعد از یک بار ری‌لود انجام می‌شود.)
 */
I18nManager.allowRTL(true);
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

SplashScreen.preventAutoHideAsync().catch(() => {
  // اگر splash از قبل بسته شده باشد، خطا مهم نیست
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: require('../../assets/fonts/Vazirmatn-Regular.ttf'),
    [fonts.medium]: require('../../assets/fonts/Vazirmatn-Medium.ttf'),
    [fonts.semibold]: require('../../assets/fonts/Vazirmatn-SemiBold.ttf'),
    [fonts.bold]: require('../../assets/fonts/Vazirmatn-Bold.ttf'),
  });

  const ready = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
