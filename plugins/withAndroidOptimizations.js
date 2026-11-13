const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
} = require('@expo/config-plugins');

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

/**
 * قواعد keep برای R8.
 *
 * `minifyEnabled` در بیلد release روشن است، پس هر کلاسی که فقط از راه بازتاب
 * (reflection) یا از روی نام رشته‌ای پیدا می‌شود باید صریح نگه داشته شود؛ وگرنه
 * نسخه‌ی release چیزی را که در دیباگ کار می‌کرد از دست می‌دهد. این قواعد کنار
 * قواعد خودِ کتابخانه‌ها (consumer rules) اضافه می‌شوند و ضرری ندارند.
 *
 * توجه: react-native-svg خودش consumerProguardFiles دارد و در عمل حذف نمی‌شود؛
 * این keep برای مقاوم‌سازی است، نه جبران یک حذف اثبات‌شده.
 */
const PROGUARD_KEEP_RULES = `
# --- darino: قواعد keep برای بیلد release (R8) ---
# نشان‌های برداری بانک‌ها (view managerهای نیتیو react-native-svg)
-keep class com.horcrux.svg.** { *; }
-dontwarn com.horcrux.svg.**

# ماژول پیامک بومی و گیرنده‌ی BroadcastReceiver
-keep class com.darino.app.sms.** { *; }

# متدهایی که React Native با بازتاب صدا می‌زند
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <fields>;
}
`;

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

  const withBuildGradle = withAppBuildGradle(withManifest, (configWithGradle) => {
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

  // قواعد keep باید بعد از ساخته‌شدن پروژه‌ی اندروید نوشته شوند
  return withProguardKeepRules(withBuildGradle);
};

/**
 * افزودن قواعد keep به `android/app/proguard-rules.pro`.
 *
 * چرا mod جدا؟ چون این فایل در فاز «dangerous» نوشته می‌شود (بعد از این‌که prebuild
 * پروژه‌ی اندروید را از قالب ساخت) و با withAppBuildGradle نمی‌شود محتوایش را
 * تغییر داد.
 */
function withProguardKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    (configWithMod) => {
      const projectRoot = configWithMod.modRequest.platformProjectRoot;
      const rulesPath = path.join(projectRoot, 'app', 'proguard-rules.pro');
      try {
        const existing = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
        if (!existing.includes('com.horcrux.svg')) {
          fs.writeFileSync(rulesPath, `${existing.trimEnd()}\n${PROGUARD_KEEP_RULES}`, 'utf8');
        }
      } catch (error) {
        // نبودن این فایل بیلد را متوقف نمی‌کند؛ فقط R8 قواعد ما را ندارد
        console.warn(`[withAndroidOptimizations] proguard-rules.pro نوشته نشد: ${error}`);
      }
      return configWithMod;
    },
  ]);
}
