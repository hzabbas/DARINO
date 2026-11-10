const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * امضای ثابت نسخه‌ی اندروید.
 *
 * اپ دیتابیس آفلاین دارد؛ اگر هر بیلد با کلید تصادفی امضا شود، نصب نسخه‌ی جدید
 * روی نسخه‌ی قبلی با خطای «Package Conflicts» شکست می‌خورد و کاربر مجبور می‌شود
 * برنامه را حذف کند. این پلاگین یک signingConfig ثابت را از متغیرهای محیطی
 * می‌خواند تا همه‌ی بیلدها (CI و لوکال) با همان کلید امضا شوند.
 *
 * متغیرها: DARINO_KEYSTORE_PATH, DARINO_STORE_PASSWORD, DARINO_KEY_ALIAS, DARINO_KEY_PASSWORD
 * اگر تنظیم نشده باشند، بیلد مثل قبل با کلید debug امضا می‌شود (فقط برای توسعه).
 */
const SIGNING_BLOCK = `
// --- darino: امضای ثابت برای آپدیت بدون حذف برنامه ---
android {
    signingConfigs {
        release {
            if (System.getenv("DARINO_KEYSTORE_PATH") != null) {
                storeFile file(System.getenv("DARINO_KEYSTORE_PATH"))
                storePassword System.getenv("DARINO_STORE_PASSWORD")
                keyAlias System.getenv("DARINO_KEY_ALIAS")
                keyPassword System.getenv("DARINO_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv("DARINO_KEYSTORE_PATH") != null) {
                signingConfig signingConfigs.release
            }
        }
    }
}
`;

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (configWithGradle) => {
    if (configWithGradle.modResults.language !== 'groovy') {
      throw new Error('withAndroidSigning فقط با build.gradle گرووی کار می‌کند');
    }

    let contents = configWithGradle.modResults.contents;
    if (contents.includes('DARINO_KEYSTORE_PATH')) {
      return configWithGradle;
    }

    contents = `${contents.trimEnd()}\n${SIGNING_BLOCK}`;
    configWithGradle.modResults.contents = contents;
    return configWithGradle;
  });
};
