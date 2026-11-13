const fs = require('node:fs');
const path = require('node:path');

const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

/**
 * پیامک‌خوان بومی و بدون مصرف باتری.
 *
 * - مجوزهای READ_SMS / RECEIVE_SMS / POST_NOTIFICATIONS را اضافه می‌کند
 * - گیرنده‌ی SMS_RECEIVED را ثبت می‌کند (فقط سرشماره‌های بانکی کاربر)
 * - ماژول Kotlin را در MainActivity پکیج می‌کند
 *
 * هیچ سرویس یا حلقه‌ی پس‌زمینه‌ای وجود ندارد؛ فقط لحظه‌ی رسیدن پیامک، گیرنده بیدار می‌شود.
 */
const PERMISSIONS = [
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.POST_NOTIFICATIONS',
];

const RECEIVER_NAME = '.sms.SmsReceiver';

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

module.exports = function withAndroidSmsReader(config) {
  return withSmsSources(withSmsPackage(withSmsPermissions(config)));
};
