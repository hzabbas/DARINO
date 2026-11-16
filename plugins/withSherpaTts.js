const fs = require('node:fs');
const path = require('node:path');

const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');

/**
 * Local neural TTS engine configuration (sherpa-onnx + Piper model).
 * Copies AAR to android/app/libs, model to assets, and adds gradle dependency.
 */
const VENDOR_DIR = path.join(__dirname, '..', 'vendor', 'sherpa-onnx');
const AAR_FILE = 'sherpa-onnx.aar';
const MODEL_DIR = 'fa_IR';

/** Engine stub file name and real implementation source path. */
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

/** Adds AAR dependency to build.gradle (idempotent). */
function withSherpaDependency(config) {
  return withAppBuildGradle(config, (configWithGradle) => {
    if (configWithGradle.modResults.language !== 'groovy') {
      throw new Error('withSherpaTts only works with groovy build.gradle');
    }

    let contents = configWithGradle.modResults.contents;
    if (contents.includes('sherpa-onnx.aar') || contents.includes('dir: "libs"')) {
      return configWithGradle;
    }

    const anchor = 'dependencies {';
    if (!contents.includes(anchor)) {
      throw new Error('withSherpaTts: dependencies block not found in app/build.gradle');
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
        throw new Error('withSherpaTts: android.package not defined in app.json');
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
          '[withSherpaTts] sherpa-onnx AAR or Piper model not found; local neural TTS disabled.',
        );
        return configWithMod;
      }

      fs.mkdirSync(libsDir, { recursive: true });
      fs.copyFileSync(path.join(VENDOR_DIR, AAR_FILE), path.join(libsDir, AAR_FILE));

      // Overwrite assets directory with fresh vendor model files.
      fs.rmSync(assetsDir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(assetsDir), { recursive: true });
      fs.cpSync(path.join(VENDOR_DIR, MODEL_DIR), assetsDir, { recursive: true });

      // Replace stub engine with real sherpa-onnx implementation.
      if (!fs.existsSync(REAL_ENGINE)) {
        throw new Error(`withSherpaTts: real engine implementation not found at ${REAL_ENGINE}`);
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
        throw new Error('withSherpaTts: real Sherpa engine does not contain OfflineTts');
      }
      fs.mkdirSync(path.dirname(engineTarget), { recursive: true });
      fs.writeFileSync(engineTarget, kotlin, 'utf8');
      console.log('[withSherpaTts] local neural TTS engine enabled');

      return configWithMod;
    },
  ]);
}

module.exports = function withSherpaTts(config) {
  return withSherpaDependency(withSherpaFiles(config));
};
