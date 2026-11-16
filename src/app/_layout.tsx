import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '../db/DatabaseProvider';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { VoiceAnnouncerSync } from '../components/VoiceAnnouncerSync';
import { fonts, useTheme } from '../theme';
import { ThemeProvider } from '../theme/ThemeProvider';

// Force RTL layout for Expo Go and web environments.
I18nManager.allowRTL(true);
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore error if splash is already dismissed.
});

function ThemedNavigator() {
  const { colors, scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen
          name="edit/[id]"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </>
  );
}

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
    <AppErrorBoundary>
      <SafeAreaProvider>
        <DatabaseProvider>
          <VoiceAnnouncerSync />
          <ThemeProvider>
            <ThemedNavigator />
          </ThemeProvider>
        </DatabaseProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
