const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Consistent release signing configuration using environment variables:
 * DARINO_KEYSTORE_PATH, DARINO_STORE_PASSWORD, DARINO_KEY_ALIAS, DARINO_KEY_PASSWORD.
 */
const SIGNING_BLOCK = `
// --- darino: Consistent release signing for seamless in-place updates ---
android {
    signingConfigs {
        release {
            enableV1Signing true
            enableV2Signing true
            enableV3Signing true
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
      throw new Error('withAndroidSigning only works with groovy build.gradle');
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
