import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBankAccount,
  getBankAccount,
  listBankAccounts,
  updateBankAccount,
} from '../src/db/bankAccounts';
import { migrate } from '../src/db/migrate';
import { setSetting } from '../src/db/settings';
import { extractPayerName } from '../src/utils/smsParser';
import {
  buildColloquialDepositSpeech,
  formatColloquialSpeechAmount,
} from '../src/utils/numberToWords';
import {
  VOICE_ANNOUNCER_RATE_KEY,
  VOICE_ANNOUNCER_SERVICE_KEY,
  VOICE_ANNOUNCER_TEMPLATE_KEY,
  buildVoiceConfigJson,
  parseVoiceAnnouncerRate,
  parseVoiceAnnouncerService,
  parseVoiceAnnouncerSettings,
  previewVoiceAnnouncerSpeech,
} from '../src/features/voiceAnnouncer';
import { DEFAULT_VOICE_TEMPLATE, VOICE_TEMPLATE_MAX_LENGTH } from '../src/utils/voiceTemplate';
import { createNodeDatabase } from './helpers/nodeDatabase';

test('colloquial amount drops هزار for everyday amounts', () => {
  assert.equal(formatColloquialSpeechAmount(70_000), 'هفتاد');
  assert.equal(formatColloquialSpeechAmount(120_000), 'صد و بیست');
  assert.equal(formatColloquialSpeechAmount(85_000), 'هشتاد و پنج');
  // ۵۰۰ تومان باقی‌مانده با شکل گفتاری «پونصد» می‌آید
  assert.equal(formatColloquialSpeechAmount(75_500), 'هفتاد و پنج و پونصد');
});

test('colloquial amount reads millions in full', () => {
  assert.equal(formatColloquialSpeechAmount(1_000_000), 'یک میلیون');
  assert.equal(formatColloquialSpeechAmount(1_200_000), 'یک میلیون و دویست هزار');
});

test('deposit speech uses the casual sentence with and without a payer', () => {
  assert.equal(
    buildColloquialDepositSpeech(70_000, 'علی محمدی'),
    'علی محمدی، هفتاد تومن برات واریز کرد',
  );
  assert.equal(
    buildColloquialDepositSpeech(70_000, null),
    'هفتاد تومن برات واریز شد',
  );
  assert.equal(
    buildColloquialDepositSpeech(70_000, '   '),
    'هفتاد تومن برات واریز شد',
  );
});

test('payer name is extracted from common iranian bank formats', () => {
  const cases: [string, string][] = [
    ['از طرف: علی محمدی', 'علی محمدی'],
    ['واریز 700,000 ریال\nاز طرف علی محمدی\nمانده: 1,200,000 ریال', 'علی محمدی'],
    ['توسط: رضا احمدی', 'رضا احمدی'],
    ['واریز کننده: سارا کریمی', 'سارا کریمی'],
    ['نام واريز كننده: مهدی رضایی', 'مهدی رضایی'],
    ['به نام محمد رضایی', 'محمد رضایی'],
    ['از علی محمدی به حساب 1234567890', 'علی محمدی'],
  ];

  for (const [body, expected] of cases) {
    assert.equal(extractPayerName(body), expected, body);
  }
});

test('payer name is null when the text has no human name', () => {
  assert.equal(extractPayerName('700,000 ریال به حساب شما نشست'), null);
  assert.equal(extractPayerName('واریز از حساب شما 700,000 ریال'), null);
  assert.equal(extractPayerName('برداشت 500,000 ریال از کارت 6104'), null);
  assert.equal(extractPayerName('واریز 700,000 ریال'), null);
});

test('announceVoice round-trips through the database', () => {
  const db = createNodeDatabase();
  migrate(db);

  const id = createBankAccount(db, {
    bank_code: 'blu',
    title: 'کارت اصلی',
    account_number: '6104337812345678',
    announceVoice: true,
  });

  assert.equal(getBankAccount(db, id)?.announceVoice, true);

  updateBankAccount(db, id, { announceVoice: false });
  assert.equal(listBankAccounts(db)[0].announceVoice, false);
});

test('voice settings default to offline AvaCore with the classic sentence', () => {
  const settings = parseVoiceAnnouncerSettings({});

  assert.equal(settings.service, 'avacore');
  assert.equal(settings.template, DEFAULT_VOICE_TEMPLATE);
  assert.equal(settings.rate, 1);
  assert.equal(settings.enabled, true);
  assert.equal(settings.chime, true);
  assert.equal(settings.gender, 'female');
});

test('an unknown voice service falls back to AvaCore', () => {
  assert.equal(parseVoiceAnnouncerService('edge'), 'edge');
  assert.equal(parseVoiceAnnouncerService('offline'), 'offline');
  assert.equal(parseVoiceAnnouncerService('system'), 'system');
  assert.equal(parseVoiceAnnouncerService('telepathy'), 'avacore');
  assert.equal(parseVoiceAnnouncerService(null), 'avacore');
});

test('speech rate stays inside the calm window', () => {
  assert.equal(parseVoiceAnnouncerRate('0.9'), 0.9);
  assert.equal(parseVoiceAnnouncerRate('1.25'), 1.25);
  assert.equal(parseVoiceAnnouncerRate('0.2'), 0.6);
  assert.equal(parseVoiceAnnouncerRate('9'), 1.4);
  assert.equal(parseVoiceAnnouncerRate('abc'), 1);
  assert.equal(parseVoiceAnnouncerRate(undefined), 1);
});

test('a broken stored template falls back to the default sentence', () => {
  const broken = parseVoiceAnnouncerSettings({ [VOICE_ANNOUNCER_TEMPLATE_KEY]: 'سلام' });
  assert.equal(broken.template, DEFAULT_VOICE_TEMPLATE);

  // جمله‌ی بلندتر از سقف هم پذیرفته نمی‌شود (همان قاعده‌ی `SpeechTemplate.sanitize`)
  const long = `{amount} ${'م'.repeat(VOICE_TEMPLATE_MAX_LENGTH)}`;
  assert.equal(
    parseVoiceAnnouncerSettings({ [VOICE_ANNOUNCER_TEMPLATE_KEY]: long }).template,
    DEFAULT_VOICE_TEMPLATE,
  );

  const custom = parseVoiceAnnouncerSettings({
    [VOICE_ANNOUNCER_TEMPLATE_KEY]: '{name} {amount} تومن زد به کارتت',
  });
  assert.equal(custom.template, '{name} {amount} تومن زد به کارتت');
});

test('the preview speaks the sample deposit with the current template', () => {
  assert.equal(
    previewVoiceAnnouncerSpeech({ template: DEFAULT_VOICE_TEMPLATE }),
    'علی محمدی، هفتاد تومن برات واریز کرد',
  );
  assert.equal(
    previewVoiceAnnouncerSpeech({ template: '{name} {amountNumber} تومن زد به کارتت' }),
    'علی محمدی ۷۰,۰۰۰ تومن زد به کارتت',
  );
  // این تابع قالب را اعتبارسنجی نمی‌کند؛ صفحه‌ی تنظیمات وقتی قالب ناقص است، خودِ
  // قالب ذخیره‌شده را برای پیش‌نمایش می‌فرستد تا آنچه دیده می‌شود همان باشد که پخش
  // می‌شود.
  assert.equal(previewVoiceAnnouncerSpeech({ template: '{name} فقط' }), 'علی محمدی فقط');
});

test('the synced config carries service, template and rate', () => {
  const db = createNodeDatabase();
  migrate(db);

  setSetting(db, VOICE_ANNOUNCER_SERVICE_KEY, 'edge');
  setSetting(db, VOICE_ANNOUNCER_TEMPLATE_KEY, '{name} {amount} تومن زد به کارتت');
  setSetting(db, VOICE_ANNOUNCER_RATE_KEY, '1.1');

  const payload = JSON.parse(buildVoiceConfigJson(db));
  assert.equal(payload.service, 'edge');
  assert.equal(payload.template, '{name} {amount} تومن زد به کارتت');
  assert.equal(payload.rate, 1.1);
  assert.deepEqual(payload.senders, []);
  assert.deepEqual(payload.accounts, []);
});
