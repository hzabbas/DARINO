import { AndroidConfig, withAndroidManifest } from '@expo/config-plugins';

/**
 * تنظیمات پنجره‌ی اکتیویتی برای کیبورد.
 *
 * `adjustResize` باعث می‌شود اندروید با باز شدن کیبورد ارتفاع پنجره را واقعاً
 * کم کند (نه اینکه روی فیلدها بیفتد). این تنظیم در کنار
 * `softwareKeyboardLayoutMode: "resize"` در app.json لازم است، چون بعضی
 * قالب‌های prebuild مقدار را روی adjustPan می‌گذارند.
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
