const fs = require('node:fs');
const path = require('node:path');

const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');

/**
 * موتور صدای عصبی فارسی روی گوشی (sherpa-onnx + مدل Piper).
 *
 * چه می‌کند:
 *  - `vendor/sherpa-onnx/sherpa-onnx.aar` را داخل `android/app/libs` کپی می‌کند
 *  - مدل Piper و `espeak-ng-data` را داخل `android/app/src/main/assets/sherpa-tts/fa_IR`
 *    می‌گذارد تا موتور در اولین استفاده آن را به `filesDir` استخراج کند
 *  - وابستگی `implementation fileTree(dir: "libs", include: ["*.jar", "*.aar"])`
 *    را به `app/build.gradle` اضافه می‌کند
 *  - اگر قطعات موجود باشند، پیاده‌سازی واقعی موتور را روی فایل جایگزین
 *    (stub) در ماژول پیامک می‌نویسد؛ اگر نباشند، stub می‌ماند و اعلام صوتی
 *    به کلیپ آفلاین/TTS گوشی برمی‌گردد (هیچ‌وقت بیلد نمی‌شکند).
 *
 * قطعات با `node scripts/fetch-sherpa-onnx.mjs` دانلود می‌شوند و در git
 * نگه‌داری نمی‌شوند (حجم زیاد + مجوز مدل‌ها).
 */
const VENDOR_DIR = path.join(__dirname, '..', 'vendor', 'sherpa-onnx');
const AAR_FILE = 'sherpa-onnx.aar';
const MODEL_DIR = 'fa_IR';

/** نام فایل stub در ماژول پیامک و فایل واقعی خارج از پوشه‌ی کپی خودکار. */
const ENGINE_FILE = 'LocalPiperTtsEngine.kt';
const REAL_ENGINE = path.join(__dirname, 'android', 'sherpa', ENGINE_FILE);

function artifactsAvailable() {
  const aar = path.join(VENDOR_DIR, AAR_FILE);
  const model = path.join(VENDOR_DIR, MODEL_DIR);
  if (!fs.existsSync(aar) || fs.statSync(aar).size < 20 * 1024 * 1024) return false;
  if (!fs.existsSync(model) || !fs.statSync(model).isDirectory()) return false;

  const files = fs.readdirSync(model);
  const hasModel = files.some((file) => file.endsWith('.onnx'));
  const hasTokens = files.includes('tokens.txt');
  const hasEspeak = files.includes('espeak-ng-data');
  return hasModel && hasTokens && hasEspeak;
}

/** وابستگی AAR را به build.gradle اضافه می‌کند (idempotent). */
function withSherpaDependency(config) {
  return withAppBuildGradle(config, (configWithGradle) => {
    if (configWithGradle.modResults.language !== 'groovy') {
      throw new Error('withSherpaTts فقط با build.gradle گرووی کار می‌کند');
    }

    let contents = configWithGradle.modResults.contents;
    if (contents.includes('sherpa-onnx.aar') || contents.includes('dir: "libs"')) {
      return configWithGradle;
    }

    const anchor = 'dependencies {';
    if (!contents.includes(anchor)) {
      throw new Error('withSherpaTts: بلوک dependencies در app/build.gradle پیدا نشد');
    }

    contents = contents.replace(
      anchor,
      `${anchor}\n    implementation fileTree(dir: "libs", include: ["*.jar", "*.aar"])`,
    );

    configWithGradle.modResults.contents = contents;
    return configWithGradle;
  });
}

function withSherpaFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (configWithMod) => {
      const projectRoot = configWithMod.modRequest.projectRoot;
      const packageName = configWithMod.android?.package;
      if (!packageName) {
        throw new Error('withSherpaTts: android.package در app.json تعریف نشده است');
      }

      const libsDir = path.join(projectRoot, 'android', 'app', 'libs');
      const assetsDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'assets',
        'sherpa-tts',
        MODEL_DIR,
      );

      if (!artifactsAvailable()) {
        console.warn(
          '[withSherpaTts] sherpa-onnx AAR یا مدل Piper پیدا نشد؛ ' +
            'صدای عصبی روی گوشی در این بیلد غیرفعال می‌شود. ' +
            'برای فعال‌کردن: node scripts/fetch-sherpa-onnx.mjs',
        );
        return configWithMod;
      }

      fs.mkdirSync(libsDir, { recursive: true });
      fs.copyFileSync(path.join(VENDOR_DIR, AAR_FILE), path.join(libsDir, AAR_FILE));

      // مدل و espeak-ng-data هر بار از نو کپی می‌شوند تا مدل حذف‌شده در پوشه‌ی
      // assets نماند و APK همیشه با نسخه‌ی vendor هم‌خوان باشد.
      fs.rmSync(assetsDir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(assetsDir), { recursive: true });
      fs.cpSync(path.join(VENDOR_DIR, MODEL_DIR), assetsDir, { recursive: true });

      // پیاده‌سازی واقعی موتور: بعد از کپی ماژول پیامک اجرا می‌شود و stub را
      // با نسخه‌ی دارای ایمپورت sherpa-onnx جایگزین می‌کند.
      if (!fs.existsSync(REAL_ENGINE)) {
        throw new Error(`withSherpaTts: پیاده‌سازی واقعی ${REAL_ENGINE} پیدا نشد`);
      }
      const engineTarget = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.'),
        'sms',
        ENGINE_FILE,
      );
      const kotlin = fs
        .readFileSync(REAL_ENGINE, 'utf8')
        .replace(/^package com\.darino\.app\.sms/m, `package ${packageName}.sms`);
      if (!kotlin.includes('com.k2fsa.sherpa.onnx.OfflineTts')) {
        throw new Error('withSherpaTts: نسخه‌ی واقعی Sherpa به‌جای stub انتخاب نشده است');
      }
      fs.mkdirSync(path.dirname(engineTarget), { recursive: true });
      fs.writeFileSync(engineTarget, kotlin, 'utf8');
      console.log('[withSherpaTts] local neural TTS engine enabled');

      return configWithMod;
    },
  ]);
}

module.exports = function withSherpaTts(config) {
  // ترتیب مهم است: modهای dangerous در `expo prebuild` برعکس ترتیب ثبت اجرا
  // می‌شوند، پس این پلاگین **قبل از** `withAndroidSmsReader` در app.json ثبت شده
  // تا بعد از کپی ماژول پیامک اجرا شود و stub با پیاده‌سازی واقعی جایگزین شود.
  return withSherpaDependency(withSherpaFiles(config));
};
