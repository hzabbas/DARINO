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
 * Native SMS reader and foreground voice announcer plugin.
 */
const PERMISSIONS = [
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  'android.permission.INTERNET',
  'android.permission.FOREGROUND_SERVICE',
  // Android 14+ requires distinct foreground service permissions.
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
  // SCHEDULE_EXACT_ALARM allows launching foreground services on Android 12+.
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

    // Query TTS service package visibility on Android 11+.
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

    // Persistent foreground voice announcer service.
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

    // Periodic guard job service.
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

    // Auto-restart on boot and package update.
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

    // Periodic wake alarm receiver.
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
    throw new Error('withAndroidSmsReader: android.package not defined in app.json');
  }

  return withMainApplication(config, (configWithApp) => {
    if (configWithApp.modResults.language !== 'kt') {
      throw new Error('withAndroidSmsReader only works with MainApplication.kt');
    }

    let contents = configWithApp.modResults.contents;
    if (contents.includes('SmsReaderPackage')) {
      return configWithApp;
    }

    const importLine = `import ${packageName}.sms.SmsReaderPackage`;
    const anchor = 'import com.facebook.react.PackageList';
    if (!contents.includes(anchor)) {
      throw new Error('withAndroidSmsReader: PackageList import not found');
    }
    contents = contents.replace(anchor, `${importLine}\n${anchor}`);

    const applyAnchor = 'PackageList(this).packages.apply {';
    if (!contents.includes(applyAnchor)) {
      throw new Error('withAndroidSmsReader: PackageList block not found');
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
    throw new Error('withAndroidSmsReader: android.package not defined in app.json');
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
        // Do not overwrite real sherpa-onnx engine with stub.
        if (
          file === ENGINE_FILE &&
          fs.existsSync(target) &&
          fs.readFileSync(target, 'utf8').includes('com.k2fsa.sherpa.onnx')
        ) {
          continue;
        }
        let content = fs.readFileSync(source, 'utf8');
        content = content.replace(/^package com\.darino\.app\.sms/m, `package ${packageName}.sms`);
        fs.writeFileSync(target, content);
      }

      return configWithMod;
    },
  ]);
}

/**
 * Copies offline voice assets into APK.
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
          'withAndroidSmsReader: assets/voice not found. Run `node scripts/generate-voice-assets.mjs`.',
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
          `withAndroidSmsReader: expected 2 gender voice folders in assets/voice, found ${genders.length}`,
        );
      }

      return configWithMod;
    },
  ]);
}

/**
 * Adds OkHttp dependency for neural voice synthesizer.
 */
function withVoiceOkHttp(config) {
  return withAppBuildGradle(config, (configWithGradle) => {
    let contents = configWithGradle.modResults.contents;
    if (contents.includes('com.squareup.okhttp3:okhttp')) {
      return configWithGradle;
    }

    const anchor = 'dependencies {';
    if (!contents.includes(anchor)) {
      throw new Error('withAndroidSmsReader: dependencies block not found in app/build.gradle');
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
