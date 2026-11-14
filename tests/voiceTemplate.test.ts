import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_VOICE_TEMPLATE,
  VOICE_TEMPLATE_MAX_LENGTH,
  isValidVoiceTemplate,
  normalizeVoiceTemplate,
  renderVoiceTemplate,
  voiceTemplateError,
} from '../src/utils/voiceTemplate';

/**
 * قالب جمله‌ی اعلام واریز.
 *
 * خروجی این تابع باید **مو‌به‌مو** با `SpeechTemplate.kt` یکی باشد؛ همان جمله‌ای
 * که در پیش‌نمایش تنظیمات دیده می‌شود، روی گوشی خوانده می‌شود.
 */

test('default template speaks the classic deposit sentence', () => {
  assert.equal(
    renderVoiceTemplate(DEFAULT_VOICE_TEMPLATE, {
      payerName: 'علی محمدی',
      amountToman: 70_000,
    }),
    'علی محمدی، هفتاد تومن برات واریز کرد',
  );
});

test('a missing payer name removes the dangling comma', () => {
  assert.equal(
    renderVoiceTemplate(DEFAULT_VOICE_TEMPLATE, { payerName: null, amountToman: 70_000 }),
    'هفتاد تومن برات واریز کرد',
  );
  assert.equal(
    renderVoiceTemplate('{name} {amount} تومن واریز کرد برات', {
      payerName: '   ',
      amountToman: 120_000,
    }),
    'صد و بیست تومن واریز کرد برات',
  );
});

test('custom templates read the amount as words or as digits', () => {
  assert.equal(
    renderVoiceTemplate('{name}، {amount} تومن زد به کارتت', {
      payerName: 'سارا کریمی',
      amountToman: 70_000,
    }),
    'سارا کریمی، هفتاد تومن زد به کارتت',
  );

  assert.equal(
    renderVoiceTemplate('{amountNumber} تومن از {bank} برای کارت {card}', {
      amountToman: 1_200_000,
      bankName: 'بانک ملت',
      cardNumber: '6104-3378-1234-5678',
    }),
    '۱,۲۰۰,۰۰۰ تومن از بانک ملت برای کارت ۵۶۷۸',
  );

  // با باقی‌مانده‌ی کمتر از هزار، «هزار و» سر جایش می‌ماند
  assert.equal(
    renderVoiceTemplate('{name} {amount} تومن واریز کرد برات', {
      payerName: null,
      amountToman: 75_500,
    }),
    'هفتاد و پنج هزار و پونصد تومن واریز کرد برات',
  );
});

test('persian tokens are the primary placeholders', () => {
  assert.equal(
    renderVoiceTemplate('{نام}، {مبلغ} تومن به {بانک} برای کارت {کارت}', {
      payerName: 'سارا کریمی',
      amountToman: 150_000,
      bankName: 'بانک ملت',
      cardNumber: '6104-3378-1234-5678',
    }),
    'سارا کریمی، صد و پنجاه تومن به بانک ملت برای کارت ۵۶۷۸',
  );

  assert.equal(
    renderVoiceTemplate('{مبلغ_رقمی} تومن', { amountToman: 2_500_000 }),
    '۲,۵۰۰,۰۰۰ تومن',
  );

  // قالب‌های لاتین ذخیره‌شده‌ی نسخه‌های قبل هنوز کار می‌کنند
  assert.equal(
    renderVoiceTemplate('{name} {amount} تومن', {
      payerName: 'علی',
      amountToman: 250_000,
    }),
    'علی دویست و پنجاه تومن',
  );
});

test('legacy latin tokens migrate to persian ones', () => {
  assert.equal(
    normalizeVoiceTemplate('{name} {amountNumber} از {bank} کارت {card}'),
    '{نام} {مبلغ_رقمی} از {بانک} کارت {کارت}',
  );
});

test('tokens inside the payer name are not expanded twice', () => {
  assert.equal(
    renderVoiceTemplate('{name} {amount} تومن', {
      payerName: '{amount} علی',
      amountToman: 70_000,
    }),
    '{amount} علی هفتاد تومن',
  );
});

test('whitespace and punctuation left by empty tokens are tidied', () => {
  assert.equal(
    renderVoiceTemplate('  {name} ،  {amount}  تومن ،  زد به کارتت  ', {
      payerName: 'مهدی رضایی',
      amountToman: 70_000,
    }),
    'مهدی رضایی، هفتاد تومن، زد به کارتت',
  );

  assert.equal(
    renderVoiceTemplate('{name} - {amount} تومن - {bank}', { amountToman: 0 }),
    'صفر تومن',
  );
});

test('an empty result falls back to the standard sentence', () => {
  assert.equal(
    renderVoiceTemplate('{name}', { payerName: null, amountToman: 70_000 }),
    'هفتاد تومن برات واریز شد',
  );
});

test('template validation needs an amount token', () => {
  assert.equal(isValidVoiceTemplate(DEFAULT_VOICE_TEMPLATE), true);
  assert.equal(isValidVoiceTemplate('{مبلغ} تومن'), true);
  assert.equal(isValidVoiceTemplate('{amountNumber} تومن'), true);
  assert.equal(isValidVoiceTemplate('{name} فقط'), false);
  assert.equal(isValidVoiceTemplate(''), false);
  assert.equal(isValidVoiceTemplate('   '), false);
  assert.equal(isValidVoiceTemplate('{amount}'.padEnd(VOICE_TEMPLATE_MAX_LENGTH + 1, 'م')), false);

  assert.equal(voiceTemplateError('{amount} تومن'), null);
  assert.match(String(voiceTemplateError('{name} فقط')), /مبلغ/);
  assert.match(String(voiceTemplateError('')), /جمله/);
});

test('normalize keeps valid text and falls back for empty or oversized ones', () => {
  assert.equal(normalizeVoiceTemplate('  {amount} تومن  '), '{مبلغ} تومن');
  assert.equal(normalizeVoiceTemplate(''), DEFAULT_VOICE_TEMPLATE);
  assert.equal(normalizeVoiceTemplate(null), DEFAULT_VOICE_TEMPLATE);

  const long = `{amount} ${'م'.repeat(VOICE_TEMPLATE_MAX_LENGTH)}`;
  assert.equal(normalizeVoiceTemplate(long).length, VOICE_TEMPLATE_MAX_LENGTH);
});
