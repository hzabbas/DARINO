const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

/**
 * بهینه‌سازی بیلد Release در زمان prebuild:
 *  - فقط معماری‌های واقعی گوشی (arm64-v8a و armeabi-v7a)؛ x86/x86_64 مخصوص شبیه‌ساز است
 *  - فشرده‌سازی .so داخل APK (legacy packaging) که حجم فایل نصبی را خیلی کم می‌کند
 *  - minify + shrinkResources برای حذف کد و منابع بی‌استفاده
 *  - splits: یک APK سبک برای هر معماری + یک APK universal برای اطمینان
 */
const GRADLE_PROPERTIES = {
  reactNativeArchitectures: 'arm64-v8a,armeabi-v7a',
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  'expo.useLegacyPackaging': 'true',
};

function setProperty(items, key, value) {
  const existing = items.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
    return;
  }
  items.push({ type: 'property', key, value });
}

const OPTIMIZATION_BLOCK = `
// --- darino: APK سبک (معماری‌های موبایل + فشرده‌سازی کتابخانه‌های بومی) ---
android {
    splits {
        abi {
            enable true
            reset()
            include 'arm64-v8a', 'armeabi-v7a'
            universalApk true
        }
    }
    packagingOptions {
        jniLibs {
            useLegacyPackaging true
        }
    }
}
`;

module.exports = function withAndroidOptimizations(config) {
  const withProperties = withGradleProperties(config, (configWithProperties) => {
    for (const [key, value] of Object.entries(GRADLE_PROPERTIES)) {
      setProperty(configWithProperties.modResults, key, value);
    }
    return configWithProperties;
  });

  // اپ کاملاً آفلاین است؛ هر ارتباط cleartext (http) در نسخه‌ی نهایی ممنوع می‌شود.
  const withManifest = withAndroidManifest(withProperties, (configWithManifest) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      configWithManifest.modResults,
    );
    application.$['android:usesCleartextTraffic'] = 'false';
    return configWithManifest;
  });

  return withAppBuildGradle(withManifest, (configWithGradle) => {
    if (configWithGradle.modResults.language !== 'groovy') {
      throw new Error('withAndroidOptimizations فقط با build.gradle گرووی کار می‌کند');
    }

    const contents = configWithGradle.modResults.contents;
    if (contents.includes('darino: APK سبک')) {
      return configWithGradle;
    }

    configWithGradle.modResults.contents = `${contents.trimEnd()}\n${OPTIMIZATION_BLOCK}`;
    return configWithGradle;
  });
};
