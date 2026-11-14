const fs = require('node:fs');
const path = require('node:path');

const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

/**
 * پیامک‌خوان بومی و بدون مصرف باتری.
 *
 * - مجوزهای READ_SMS / RECEIVE_SMS / POST_NOTIFICATIONS را اضافه می‌کند
 * - مجوز WAKE_LOCK برای پخش صدا با صفحه‌ی خاموش و INTERNET برای گوینده‌ی عصبی
 * - گیرنده‌ی SMS_RECEIVED را ثبت می‌کند (فقط سرشماره‌های بانکی کاربر)
 * - ماژول Kotlin را در MainActivity پکیج می‌کند
 *
 * هیچ سرویس یا حلقه‌ی پس‌زمینه‌ای وجود ندارد؛ فقط لحظه‌ی رسیدن پیامک، گیرنده بیدار می‌شود.
 */
const PERMISSIONS = [
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  'android.permission.INTERNET',
];

const RECEIVER_NAME = '.sms.SmsReceiver';

/** موتور TTS مستقل آواکور؛ اپ دارینو فقط با همین پکیج به آن وصل می‌شود. */
const AVACORE_PACKAGE = 'com.github.opscalehub.avacore';

function withSmsPermissions(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults;
    manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] ?? [];

    for (const permission of PERMISSIONS) {
      const exists = manifest.manifest['uses-permission'].some(
        (item) => item.$?.['android:name'] === permission,
      );
      if (!exists) {
        manifest.manifest['uses-permission'].push({ $: { 'android:name': permission } });
      }
    }

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    application.receiver = application.receiver ?? [];

    // در اندروید ۱۱+ برای دیدن موتورهای TTS نصب‌شده باید در <queries> اعلام شود؛
    // وگرنه fallback آفلاین گوینده کار نمی‌کند.
    manifest.manifest.queries = manifest.manifest.queries ?? [];
    const hasTtsQuery = manifest.manifest.queries.some((query) =>
      (query.intent ?? []).some((intent) =>
        (intent.action ?? []).some(
          (action) => action.$?.['android:name'] === 'android.intent.action.TTS_SERVICE',
        ),
      ),
    );
    if (!hasTtsQuery) {
      manifest.manifest.queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.TTS_SERVICE' } }],
          },
        ],
      });
    }

    // اپ آواکور جدا نصب می‌شود؛ بدون این اعلان، packageManager روی اندروید ۱۱+
    // نمی‌تواند نصب بودنش را ببیند و تنظیمات همیشه «نصب نیست» نشان می‌دهد.
    const hasAvaCoreQuery = manifest.manifest.queries.some((query) =>
      (query.package ?? []).some((entry) => entry.$?.['android:name'] === AVACORE_PACKAGE),
    );
    if (!hasAvaCoreQuery) {
      manifest.manifest.queries.push({
        package: [{ $: { 'android:name': AVACORE_PACKAGE } }],
      });
    }

    const alreadyRegistered = application.receiver.some(
      (item) => item.$?.['android:name'] === RECEIVER_NAME,
    );

    if (!alreadyRegistered) {
      application.receiver.push({
        $: {
          'android:name': RECEIVER_NAME,
          'android:enabled': 'true',
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }],
          },
        ],
      });
    }

    return configWithManifest;
  });
}

function withSmsPackage(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error('withAndroidSmsReader: android.package در app.json تعریف نشده است');
  }

  return withMainApplication(config, (configWithApp) => {
    if (configWithApp.modResults.language !== 'kt') {
      throw new Error('withAndroidSmsReader فقط با MainApplication.kt کار می‌کند');
    }

    let contents = configWithApp.modResults.contents;
    if (contents.includes('SmsReaderPackage')) {
      return configWithApp;
    }

    const importLine = `import ${packageName}.sms.SmsReaderPackage`;
    const anchor = 'import com.facebook.react.PackageList';
    if (!contents.includes(anchor)) {
      throw new Error('withAndroidSmsReader: ایمپورت PackageList پیدا نشد');
    }
    contents = contents.replace(anchor, `${importLine}\n${anchor}`);

    const applyAnchor = 'PackageList(this).packages.apply {';
    if (!contents.includes(applyAnchor)) {
      throw new Error('withAndroidSmsReader: بلوک PackageList پیدا نشد');
    }
    contents = contents.replace(
      applyAnchor,
      `${applyAnchor}\n          add(SmsReaderPackage())`,
    );

    configWithApp.modResults.contents = contents;
    return configWithApp;
  });
}

function withSmsSources(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error('withAndroidSmsReader: android.package در app.json تعریف نشده است');
  }

  const sourceDir = path.join(__dirname, 'android', 'sms');

  return withDangerousMod(config, [
    'android',
    async (configWithMod) => {
      const projectRoot = configWithMod.modRequest.projectRoot;
      const targetDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.'),
        'sms',
      );

      fs.mkdirSync(targetDir, { recursive: true });

      for (const file of fs.readdirSync(sourceDir)) {
        if (!file.endsWith('.kt')) continue;
        const source = path.join(sourceDir, file);
        let content = fs.readFileSync(source, 'utf8');
        // پکیج Kotlin باید با applicationId هماهنگ باشد
        content = content.replace(/^package com\.darino\.app\.sms/m, `package ${packageName}.sms`);
        fs.writeFileSync(path.join(targetDir, file), content);
      }

      return configWithMod;
    },
  ]);
}

/**
 * کلیپ‌های عصبی فارسی (`assets/voice`) را داخل APK کپی می‌کند.
 *
 * پخش آفلاین به `context.assets.open("voice/female/70.mp3")` تکیه می‌کند؛ اگر
 * این پوشه ساخته نشود، گوینده فقط با اینترنت کار می‌کند. برای همین اگر
 * دارایی‌ها نباشند prebuild با پیام روشن متوقف می‌شود، نه این‌که بی‌صدا رد شود.
 */
function withVoiceAssets(config) {
  return withDangerousMod(config, [
    'android',
    async (configWithMod) => {
      const projectRoot = configWithMod.modRequest.projectRoot;
      const source = path.join(projectRoot, 'assets', 'voice');
      const target = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'assets',
        'voice',
      );

      if (!fs.existsSync(source)) {
        throw new Error(
          'withAndroidSmsReader: assets/voice پیدا نشد. ' +
            'با `node scripts/generate-voice-assets.mjs` بسازید.',
        );
      }

      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(source, target, { recursive: true });

      const genders = fs.readdirSync(target).filter((entry) =>
        fs.statSync(path.join(target, entry)).isDirectory(),
      );
      if (genders.length !== 2) {
        throw new Error(
          `withAndroidSmsReader: فقط ${genders.length} پوشه‌ی صدا در assets/voice هست`,
        );
      }

      return configWithMod;
    },
  ]);
}

/**
 * OkHttp برای گوینده‌ی عصبی (WebSocket مایکروسافت).
 * React Native خودش OkHttp را می‌آورد، ولی وابستگی صریح نسخه را تثبیت و از
 * حذف ناخواسته در بیلدهای آینده جلوگیری می‌کند.
 */
function withVoiceOkHttp(config) {
  return withAppBuildGradle(config, (configWithGradle) => {
    let contents = configWithGradle.modResults.contents;
    if (contents.includes('com.squareup.okhttp3:okhttp')) {
      return configWithGradle;
    }

    const anchor = 'dependencies {';
    if (!contents.includes(anchor)) {
      throw new Error('withAndroidSmsReader: بلوک dependencies در app/build.gradle پیدا نشد');
    }

    contents = contents.replace(
      anchor,
      `${anchor}\n    implementation("com.squareup.okhttp3:okhttp:4.12.0")`,
    );

    configWithGradle.modResults.contents = contents;
    return configWithGradle;
  });
}

module.exports = function withAndroidSmsReader(config) {
  return withVoiceAssets(
    withVoiceOkHttp(withSmsSources(withSmsPackage(withSmsPermissions(config)))),
  );
};
