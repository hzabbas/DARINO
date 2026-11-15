import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const announcer = read('plugins/android/sms/DepositVoiceAnnouncer.kt');
const moduleSource = read('plugins/android/sms/SmsReaderModule.kt');
const settings = read('src/app/settings.tsx');
const sherpa = read('plugins/android/sherpa/LocalPiperTtsEngine.kt');
const sherpaPlugin = read('plugins/withSherpaTts.js');

test('each engine test stays strict; offline fallback is reserved for real background SMS', () => {
  assert.match(announcer, /fun announceTest\([\s\S]*?\): VoicePlaybackResult/);
  assert.match(announcer, /fun play\([\s\S]*?allowFallback: Boolean = true/);
  assert.match(announcer, /announceTest[\s\S]*allowFallback = false/);
  assert.doesNotMatch(
    announcer.slice(announcer.indexOf('fun announceTest('), announcer.indexOf('fun play(')),
    /playBundled|playSample|speakWithSystem\(/,
  );
});

test('native voice tests receive six live parameters directly and persist them synchronously', () => {
  assert.match(
    moduleSource,
    /fun testVoiceAnnouncement\(\s*engine: String,\s*gender: String,\s*rate: Double,\s*template: String,\s*chimeEnabled: Boolean,\s*amountToman: Double,\s*promise: Promise/,
  );
  assert.match(moduleSource, /VoiceConfigStore\.saveVoiceSelection\(/);
  assert.match(moduleSource, /map\.putBoolean\("ok"/);
  assert.match(moduleSource, /map\.putString\("message"/);
});

test('Sherpa first extraction validates model contents before creating its ready marker', () => {
  assert.match(sherpa, /fun hasRequiredModelFiles\(directory: File\): Boolean/);
  assert.match(sherpa, /phondata/);
  assert.match(sherpa, /fa_dict/);
  const extraction = sherpa.slice(sherpa.indexOf('private fun ensureModel('), sherpa.indexOf('private fun copyAssetTree('));
  assert.match(extraction, /if \(hasModelFiles\(directory\)\) return directory/);
  const validation = extraction.indexOf('if (!hasRequiredModelFiles(directory))');
  const marker = extraction.indexOf('File(directory, READY_MARKER).writeText("ok")');
  assert.ok(validation >= 0 && marker > validation, 'content validation must precede the marker');
  assert.match(extraction.slice(marker), /hasModelFiles\(directory\)/);
});

test('prebuild cannot replace the real Sherpa engine with the no-artifact stub', () => {
  const smsPlugin = read('plugins/withAndroidSmsReader.js');
  assert.match(smsPlugin, /ENGINE_FILE/);
  assert.match(smsPlugin, /com\.k2fsa\.sherpa\.onnx/);
  assert.match(sherpaPlugin, /fs\.mkdirSync\(path\.dirname\(engineTarget\), \{ recursive: true \}\)/);
  assert.doesNotMatch(sherpaPlugin, /if \(fs\.existsSync\(engineTarget\)\)/);
});

test('Settings exposes four independent engine tests and one active-engine test', () => {
  assert.ok(settings.includes('useState<VoiceAnnouncerService | null>(null)'));
  assert.match(settings, /handleTestVoice = async \(service: VoiceAnnouncerService\)/);
  assert.match(settings, /accessibilityLabel=\{`تست صدا: \$\{option\.label\}`\}/);
  assert.match(settings, /accessibilityLabel="تست اعلام صوتی"/);
  assert.match(settings, /result\.message/);
  assert.doesNotMatch(settings, /VOICE_ANNOUNCER_TEST_AMOUNT_LARGE/);
  assert.doesNotMatch(settings, /تست \$\{toPersianDigits/);
});
