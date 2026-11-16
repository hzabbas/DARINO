import { AndroidConfig, withAndroidManifest } from '@expo/config-plugins';

/**
 * Configure MainActivity windowSoftInputMode to adjustResize.
 */
const ACTIVITY = '.MainActivity';

export default function withKeyboardResize(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    const activities = application.activity ?? [];
    const mainActivity =
      activities.find((activity) => activity.$?.['android:name'] === ACTIVITY) ?? activities[0];

    if (mainActivity) {
      mainActivity.$ = {
        ...mainActivity.$,
        'android:windowSoftInputMode': 'adjustResize',
      };
    }

    return configWithManifest;
  });
}
