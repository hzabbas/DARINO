#!/usr/bin/env node
// Compile the real Android voice Kotlin against the bundled Sherpa AAR and run
// deterministic JVM contracts without an Android SDK or an emulator.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const javaHome = process.env.ANDROID_STUDIO_JBR
  ?? 'C:/Program Files/Android/Android Studio/jbr';
const compiler = process.env.KOTLINC
  ?? (process.platform === 'win32'
    ? 'C:/Program Files/Android/Android Studio/plugins/Kotlin/kotlinc/bin/kotlinc.bat'
    : 'kotlinc');
const jar = process.platform === 'win32' ? `${javaHome}/bin/java.exe` : 'java';
const aar = path.join(root, 'vendor/sherpa-onnx/sherpa-onnx.aar');
if (!existsSync(compiler) || !existsSync(aar)) {
  console.error('Sherpa AAR or kotlinc is missing. Run scripts/fetch-sherpa-onnx.mjs first.');
  process.exit(1);
}

const work = mkdtempSync(path.join(tmpdir(), 'darino-voice-kotlin-'));
const sources = [
  'plugins/android/sms/SmsSender.kt',
  'plugins/android/sms/DepositSpeech.kt',
  'plugins/android/sms/SpeechTemplate.kt',
  'plugins/android/sms/VoiceConfig.kt',
  'plugins/android/sms/DepositSmsParser.kt',
  'plugins/android/sms/VoiceClipStitcher.kt',
  'plugins/android/sms/DepositVoiceAnnouncer.kt',
  'plugins/android/sms/NeuralVoiceSynth.kt',
  'plugins/android/sms/EdgeToken.kt',
  'plugins/android/sms/PersianFinglish.kt',
  'plugins/android/sms/SmsReaderModule.kt',
  'plugins/android/sherpa/LocalPiperTtsEngine.kt',
  'tests/helpers/voiceAndroidStubs.kt',
  ...readdirSync(path.join(root, 'tests/helpers/kotlin'))
    .filter((file) => file.endsWith('.kt'))
    .map((file) => `tests/helpers/kotlin/${file}`),
].map((file) => path.join(root, file));
const out = path.join(work, 'voice.jar');
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  JAVA_TOOL_OPTIONS: '-Dfile.encoding=UTF-8',
  _JAVA_OPTIONS: '-Dfile.encoding=UTF-8',
};

try {
  const compileArgs = [...sources, '-cp', path.join(work, 'classes.jar'), '-Xskip-metadata-version-check', '-include-runtime', '-d', out];
  const classesJarPath = path.join(work, 'classes.jar');
  let extracted = false;
  const unpack = spawnSync('unzip', ['-p', aar, 'classes.jar'], {
    maxBuffer: 4 * 1024 * 1024, env, timeout: 30_000,
  });
  if (unpack.status === 0 && unpack.stdout && unpack.stdout.length > 0) {
    writeFileSync(classesJarPath, unpack.stdout);
    extracted = true;
  } else {
    const tarUnpack = spawnSync('tar', ['-xf', aar, '-C', work, 'classes.jar'], {
      env, timeout: 30_000,
    });
    if (tarUnpack.status === 0 && existsSync(classesJarPath)) {
      extracted = true;
    }
  }
  if (!extracted) {
    console.error('Cannot extract Sherpa classes.jar:', unpack.stderr?.toString());
    process.exit(1);
  }
  const compilerHome = path.resolve(path.dirname(compiler), '..');
  // Invoke the compiler's JVM entry point instead of kotlinc.bat. Windows shell
  // quoting around Android Studio's "Program Files" path is then irrelevant.
  const compile = spawnSync(
    jar,
    [
      '-Dfile.encoding=UTF-8',
      `-Dkotlin.home=${compilerHome}`,
      '-cp', path.join(compilerHome, 'lib', '*'),
      'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      ...compileArgs,
    ],
    { encoding: 'utf8', env, timeout: 120_000 },
  );
  if (compile.status !== 0) {
    console.error(compile.stdout, compile.stderr);
    process.exit(compile.status || 1);
  }
  const run = spawnSync(jar, ['-Dfile.encoding=UTF-8', '-jar', out], {
    encoding: 'utf8', env, timeout: 30_000,
  });
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  process.exit(run.status || 0);
} finally {
  rmSync(work, { recursive: true, force: true });
}
