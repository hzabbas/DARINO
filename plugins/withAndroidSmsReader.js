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
 * پیامک‌خوان بومی + نگهبان دائمی اعلام صوتی واریز.
 *
 * - مجوزهای READ_SMS / RECEIVE_SMS / POST_NOTIFICATIONS را اضافه می‌کند
 * - مجوزهای سرویس پیش‌زمینه، بوت و معاف از بهینه‌سازی باتری را اضافه می‌کند
 * - گیرنده‌ی SMS_RECEIVED را ثبت می‌کند (فقط سرشماره‌های بانکی کاربر)
 * - سرویس دائمی `VoiceAnnouncerService` و گیرنده‌ی بوت را ثبت می‌کند
 * - ماژول Kotlin را در MainActivity پکیج می‌کند
 */
const PERMISSIONS = [
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  'android.permission.INTERNET',
  'android.permission.FOREGROUND_SERVICE',
  // اندروید ۱۴+ برای `mediaPlayback` و `specialUse` مجوز جدا می‌خواهد.
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
  // آلارم دقیق، تنها راه مجاز شروع سرویس پیش‌زمینه از پس‌زمینه در اندروید ۱۲+
  // است؛ بدون آن، برگرداندن سرویس بعد از بستن کامل اپ ممکن نیست.
  'android.permission.SCHEDULE_EXACT_ALARM',
];

const RECEIVER_NAME = '.sms.SmsReceiver';
const SERVICE_NAME = '.sms.VoiceAnnouncerService';
const BOOT_RECEIVER_NAME = '.sms.BootReceiver';
const JOB_SERVICE_NAME = '.sms.VoiceGuardJobService';
const WAKE_RECEIVER_NAME = '.sms.WakeReceiver';
const ENGINE_FILE = 'LocalPiperTtsEngine.kt';

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

    // اپ آواکور حذف شده است؛ دیگر نیازی به <queries> برای پکیج جدا نیست.

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

    // سرویس دائمی اعلام صوتی. `stopWithTask="false"` حیاتی است: کنار زدن اپ از
    // «برنامه‌های اخیر» نباید سرویس را بکشد. نوع سرویس هر دو `mediaPlayback`
    // (کار اصلی: پخش جمله) و `specialUse` (پشتیبان روی رام‌هایی که پخش را
    // نمی‌پذیرند) اعلام می‌شود؛ کد در زمان اجرا اول mediaPlayback را امتحان
    // می‌کند و بعد specialUse.
    application.service = application.service ?? [];
    const existingService = application.service.find(
      (item) => item.$?.['android:name'] === SERVICE_NAME,
    );
    if (existingService) {
      existingService.$['android:foregroundServiceType'] = 'mediaPlayback|specialUse';
      existingService.property = [
        {
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value': 'Incoming bank deposit SMS voice announcer for drivers',
          },
        },
      ];
    } else {
      application.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:stopWithTask': 'false',
          'android:foregroundServiceType': 'mediaPlayback|specialUse',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'Incoming bank deposit SMS voice announcer for drivers',
            },
          },
        ],
      });
    }

    // جاب دوره‌ای پایدار. مستقل از آلارم، سرویس را زنده نگه می‌دارد و بعد از
    // بوت هم دوباره اجرا می‌شود؛ بدون آن، کشته‌شدن فرایند در شیائومی سرویس را
    // تا باز شدن دستی اپ خاموش می‌گذاشت.
    const hasJobService = application.service.some(
      (item) => item.$?.['android:name'] === JOB_SERVICE_NAME,
    );
    if (!hasJobService) {
      application.service.push({
        $: {
          'android:name': JOB_SERVICE_NAME,
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:permission': 'android.permission.BIND_JOB_SERVICE',
        },
      });
    }

    // بعد از بوت و بعد از به‌روزرسانی اپ، سرویس دوباره بالا می‌آید.
    const hasBootReceiver = application.receiver.some(
      (item) => item.$?.['android:name'] === BOOT_RECEIVER_NAME,
    );
    if (!hasBootReceiver) {
      application.receiver.push({
        $: {
          'android:name': BOOT_RECEIVER_NAME,
          'android:enabled': 'true',
          'android:exported': 'true',
          'android:directBootAware': 'false',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
              { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
              { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
              { $: { 'android:name': 'com.htc.intent.action.QUICKBOOT_POWERON' } },
            ],
          },
        ],
      });
    }

    // آلارم نگهبان: هر ۱۵ دقیقه فرایند را بیدار می‌کند و سرویس را برمی‌گرداند.
    // `exported="false"` کافی است چون آلارم از داخل همین اپ ست می‌شود.
    const hasWakeReceiver = application.receiver.some(
      (item) => item.$?.['android:name'] === WAKE_RECEIVER_NAME,
    );
    if (!hasWakeReceiver) {
      application.receiver.push({
        $: {
          'android:name': WAKE_RECEIVER_NAME,
          'android:enabled': 'true',
          'android:exported': 'false',
        },
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
        const target = path.join(targetDir, file);
        // dangerous modها ممکن است در prebuildهای بعدی ترتیب دیگری بگیرند؛
        // stub هرگز نباید پیاده‌سازی واقعیِ کپی‌شده را بازنویسی کند.
        if (
          file === ENGINE_FILE &&
          fs.existsSync(target) &&
          fs.readFileSync(target, 'utf8').includes('com.k2fsa.sherpa.onnx')
        ) {
          continue;
        }
        let content = fs.readFileSync(source, 'utf8');
        // پکیج Kotlin باید با applicationId هماهنگ باشد
        content = content.replace(/^package com\.darino\.app\.sms/m, `package ${packageName}.sms`);
        fs.writeFileSync(target, content);
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
