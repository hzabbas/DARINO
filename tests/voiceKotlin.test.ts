import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const canCompile = process.platform === 'win32'
  ? fs.existsSync('C:/Program Files/Android/Android Studio/plugins/Kotlin/kotlinc/bin/kotlinc.bat')
  : true;

test('production Kotlin compiles with Sherpa and passes native speech contracts', {
  skip: !canCompile || !fs.existsSync('vendor/sherpa-onnx/sherpa-onnx.aar'),
  timeout: 120_000,
}, () => {
  const result = execFileSync(process.execPath, ['scripts/verify-voice-kotlin.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.match(result, /VOICE_KOTLIN_OK/);
});
