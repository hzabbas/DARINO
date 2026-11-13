import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LTR_ISOLATE_END,
  LTR_ISOLATE_START,
  directionForInput,
  isolateLtr,
  isLatinToken,
  joinLtrTokens,
  stripDirectionalMarks,
} from '../src/utils/bidi';

test('ltr tokens are wrapped in isolate characters so "+98" is not mirrored', () => {
  assert.equal(isolateLtr('+989999987641'), `${LTR_ISOLATE_START}+989999987641${LTR_ISOLATE_END}`);
  assert.equal(isolateLtr('  B.Pasargad  '), `${LTR_ISOLATE_START}B.Pasargad${LTR_ISOLATE_END}`);
  assert.equal(isolateLtr(''), '');
  assert.equal(isolateLtr(null), '');

  // دوباره جدا کردن نباید تودرتو شود
  const once = isolateLtr('+989999987641');
  assert.equal(isolateLtr(once), once);
});

test('sender lists keep each token readable inside an RTL sentence', () => {
  assert.equal(
    joinLtrTokens(['+989999987641', 'B.Pasargad']),
    `${LTR_ISOLATE_START}+989999987641${LTR_ISOLATE_END}، ${LTR_ISOLATE_START}B.Pasargad${LTR_ISOLATE_END}`,
  );
  assert.equal(joinLtrTokens([]), '');
  assert.equal(joinLtrTokens(['', '  ']), '');
});

test('invisible direction markers are stripped', () => {
  const withNoise = `${LTR_ISOLATE_START}+989999987641${LTR_ISOLATE_END}\u200c\u200e\u00a0`;
  assert.equal(stripDirectionalMarks(withNoise), '+989999987641');
  assert.equal(stripDirectionalMarks(null), '');
});

test('input direction follows the content and falls back to the placeholder', () => {
  // فیلد خالی: جهت از placeholder می‌آید تا مکان‌نما روی حرف اول نیفتد
  assert.equal(directionForInput('', 'موجودی قبلی (تومان)'), 'rtl');
  assert.equal(directionForInput('', 'شماره کارت'), 'rtl');
  assert.equal(directionForInput('', 'Card number'), 'ltr');

  assert.equal(directionForInput('کارت اصلی', ''), 'rtl');
  assert.equal(directionForInput('1234567890', ''), 'ltr');
  assert.equal(directionForInput('+989999987641', ''), 'ltr');
  assert.equal(directionForInput('B.Pasargad', ''), 'ltr');
  assert.equal(directionForInput('', ''), 'rtl');
  assert.equal(directionForInput(null, null as unknown as string), 'rtl');
});

test('latin token detection ignores persian text', () => {
  assert.equal(isLatinToken('+989999987641'), true);
  assert.equal(isLatinToken('B.Pasargad'), true);
  assert.equal(isLatinToken('کارت اصلی'), false);
  assert.equal(isLatinToken(''), false);
});
