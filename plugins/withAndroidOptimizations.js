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
 * Release build optimizations:
 *  - Target phone ABIs (arm64-v8a, armeabi-v7a)
 *  - Legacy packaging (.so compression in APK)
 *  - R8 minification and resource shrinking
 *  - ABI splits and universal APK
 */
const GRADLE_PROPERTIES = {
  reactNativeArchitectures: 'arm64-v8a,armeabi-v7a',
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  'expo.useLegacyPackaging': 'true',
};

/**
 * ProGuard keep rules for R8.
 */
const PROGUARD_KEEP_RULES = `
# --- darino: ProGuard keep rules for release build (R8) ---
-keep class com.horcrux.svg.** { *; }
-dontwarn com.horcrux.svg.**

-keep class com.darino.app.sms.** { *; }

-keep class com.k2fsa.sherpa.onnx.** { *; }
-keep class org.onnxruntime.** { *; }
-dontwarn com.k2fsa.sherpa.onnx.**
-dontwarn org.onnxruntime.**

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
// --- darino: APK packaging optimizations ---
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
    androidResources {
        noCompress += ['onnx', 'mp3']
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

  // Enforce offline-only security; disable cleartext traffic.
  const withManifest = withAndroidManifest(withProperties, (configWithManifest) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      configWithManifest.modResults,
    );
    application.$['android:usesCleartextTraffic'] = 'false';
    return configWithManifest;
  });

  const withBuildGradle = withAppBuildGradle(withManifest, (configWithGradle) => {
    if (configWithGradle.modResults.language !== 'groovy') {
      throw new Error('withAndroidOptimizations only supports groovy build.gradle');
    }

    const contents = configWithGradle.modResults.contents;
    if (contents.includes('darino: APK packaging optimizations')) {
      return configWithGradle;
    }

    configWithGradle.modResults.contents = `${contents.trimEnd()}\n${OPTIMIZATION_BLOCK}`;
    return configWithGradle;
  });

  return withProguardKeepRules(withBuildGradle);
};

/**
 * Append ProGuard keep rules to android/app/proguard-rules.pro.
 */
function withProguardKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    (configWithMod) => {
      const projectRoot = configWithMod.modRequest.platformProjectRoot;
      const rulesPath = path.join(projectRoot, 'app', 'proguard-rules.pro');
      try {
        const existing = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
        if (!existing.includes('darino: ProGuard keep rules')) {
          fs.writeFileSync(rulesPath, `${existing.trimEnd()}\n${PROGUARD_KEEP_RULES}`, 'utf8');
        }
      } catch (error) {
        console.warn(`[withAndroidOptimizations] Failed to write proguard-rules.pro: ${error}`);
      }
      return configWithMod;
    },
  ]);
}
