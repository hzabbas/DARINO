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
  buildVoiceAnnouncementTestOptions,
  buildVoiceConfigJson,
  parseVoiceAnnouncerRate,
  parseVoiceAnnouncerService,
  parseVoiceAnnouncerSettings,
  previewVoiceAnnouncerSpeech,
} from '../src/features/voiceAnnouncer';
import { DEFAULT_VOICE_TEMPLATE, VOICE_TEMPLATE_MAX_LENGTH } from '../src/utils/voiceTemplate';
import { clipsFor, VOICE_ENDING_CLIP } from '../src/features/voiceClipStitcher';
import { createNodeDatabase } from './helpers/nodeDatabase';

test('colloquial amount drops هزار for whole thousands', () => {
  assert.equal(formatColloquialSpeechAmount(1_000), 'هزار');
  assert.equal(formatColloquialSpeechAmount(70_000), 'هفتاد');
  assert.equal(formatColloquialSpeechAmount(120_000), 'صد و بیست');
  assert.equal(formatColloquialSpeechAmount(85_000), 'هشتاد و پنج');
  assert.equal(formatColloquialSpeechAmount(150_000), 'صد و پنجاه');
  assert.equal(formatColloquialSpeechAmount(250_000), 'دویست و پنجاه');
  assert.equal(formatColloquialSpeechAmount(500_000), 'پونصد');
  assert.equal(formatColloquialSpeechAmount(850_000), 'هشتصد و پنجاه');
  assert.equal(formatColloquialSpeechAmount(980_000), 'نهصد و هشتاد');
  // مبلغ‌های بالای ۱۰۰ هزار تومان، همان مسیری که دکمه‌ی دوم تست صدا می‌رود
  assert.equal(formatColloquialSpeechAmount(105_000), 'صد و پنج');
  assert.equal(formatColloquialSpeechAmount(1_500_000), 'یک میلیون و پونصد هزار');
});

test('colloquial amount keeps هزار for a sub-thousand remainder', () => {
  assert.equal(
    formatColloquialSpeechAmount(125_500),
    'صد و بیست و پنج هزار و پونصد',
  );
  assert.equal(formatColloquialSpeechAmount(75_500), 'هفتاد و پنج هزار و پونصد');
});

test('colloquial amount reads millions in full', () => {
  assert.equal(formatColloquialSpeechAmount(1_000_000), 'یک میلیون');
  assert.equal(formatColloquialSpeechAmount(1_200_000), 'یک میلیون و دویست هزار');
  assert.equal(formatColloquialSpeechAmount(2_500_000), 'دو میلیون و پونصد هزار');
});

test('every supported amount decomposes into bundled voice clips', () => {
  const amounts = [
    1_000, 70_000, 120_000, 150_000, 250_000, 500_000, 850_000, 980_000,
    125_500, 1_000_000, 1_200_000, 2_500_000, 99_999_999, 999_999_000,
  ];

  for (const amount of amounts) {
    const clips = clipsFor(amount);
    assert.ok(clips && clips.length > 1, `clips for ${amount}`);
    assert.equal(clips[clips.length - 1], VOICE_ENDING_CLIP, `ending for ${amount}`);
    for (const clip of clips) {
      assert.ok(clip.length > 0 && !clip.includes('undefined'), `clip ${clip} for ${amount}`);
    }
  }

  assert.deepEqual(clipsFor(120_000), ['100_o', '20', 'toman_variz_shod']);
  assert.deepEqual(clipsFor(125_500), [
    '100_o', '20_o', '5', 'hezar_o', '500', 'toman_variz_shod',
  ]);
  assert.deepEqual(clipsFor(1_200_000), [
    '1', 'milyoon_o', '200', 'hezar', 'toman_variz_shod',
  ]);
  assert.deepEqual(clipsFor(500_000), ['500', 'toman_variz_shod']);
  assert.equal(clipsFor(0), null);
  assert.equal(clipsFor(1_000_000_000), null);
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

test('voice settings default to the online neural voice and the classic sentence', () => {
  const settings = parseVoiceAnnouncerSettings({});

  assert.equal(settings.service, 'neural');
  assert.equal(settings.template, DEFAULT_VOICE_TEMPLATE);
  assert.equal(settings.rate, 1);
  assert.equal(settings.enabled, true);
  assert.equal(settings.chime, true);
  assert.equal(settings.gender, 'female');
});

test('service ids stay canonical and old values migrate without audio regression', () => {
  assert.equal(parseVoiceAnnouncerService('local'), 'local');
  assert.equal(parseVoiceAnnouncerService('neural'), 'neural');
  assert.equal(parseVoiceAnnouncerService('clips'), 'clips');
  assert.equal(parseVoiceAnnouncerService('system'), 'system');
  assert.equal(parseVoiceAnnouncerService('edge'), 'neural');
  assert.equal(parseVoiceAnnouncerService('offline'), 'clips');
  assert.equal(parseVoiceAnnouncerService('avacore'), 'neural');
  assert.equal(parseVoiceAnnouncerService('telepathy'), 'neural');
  assert.equal(parseVoiceAnnouncerService(null), 'neural');
});

test('speech rate stays inside the calm window', () => {
  assert.equal(parseVoiceAnnouncerRate('0.9'), 0.9);
  assert.equal(parseVoiceAnnouncerRate('1.25'), 1.25);
  assert.equal(parseVoiceAnnouncerRate('0.2'), 0.6);
  assert.equal(parseVoiceAnnouncerRate('9'), 1.4);
  assert.equal(parseVoiceAnnouncerRate('abc'), 1);
  assert.equal(parseVoiceAnnouncerRate(undefined), 1);
});

test('a text-only custom template is kept and legacy placeholders migrate', () => {
  const custom = parseVoiceAnnouncerSettings({ [VOICE_ANNOUNCER_TEMPLATE_KEY]: 'پیام واریز جدید' });
  assert.equal(custom.template, 'پیام واریز جدید');
  assert.equal(previewVoiceAnnouncerSpeech({ template: 'پیام واریز جدید' }), 'پیام واریز جدید');

  const long = 'م'.repeat(VOICE_TEMPLATE_MAX_LENGTH + 1);
  assert.equal(
    parseVoiceAnnouncerSettings({ [VOICE_ANNOUNCER_TEMPLATE_KEY]: long }).template,
    DEFAULT_VOICE_TEMPLATE,
  );

  const tokenTemplate = parseVoiceAnnouncerSettings({
    [VOICE_ANNOUNCER_TEMPLATE_KEY]: '{name} {amount} تومن زد به کارتت',
  });
  // قالب ذخیره‌شده‌ی نسخه‌های قبل خودکار به توکن‌های فارسی مهاجرت می‌کند.
  assert.equal(tokenTemplate.template, '{نام} {مبلغ} تومن زد به کارتت');
});

test('the preview speaks the sample deposit with the current template', () => {
  assert.equal(
    previewVoiceAnnouncerSpeech({ template: DEFAULT_VOICE_TEMPLATE }),
    'علی محمدی، هفتاد تومن برات واریز کرد',
  );
  assert.equal(
    previewVoiceAnnouncerSpeech({ template: '{name} {amountNumber} تومن زد به کارتت' }),
    'علی محمدی ۷۰,۰۰۰ تومن زد به کارتت',
  );  // این تابع قالب را اعتبارسنجی نمی‌کند؛ صفحه‌ی تنظیمات وقتی قالب ناقص است، خودِ
  // قالب ذخیره‌شده را برای پیش‌نمایش می‌فرستد تا آنچه دیده می‌شود همان باشد که پخش
  // می‌شود.
  assert.equal(previewVoiceAnnouncerSpeech({ template: '{name} فقط' }), 'علی محمدی فقط');
});

test('the native test options use exactly the keys the bridge reads', () => {
  const options = buildVoiceAnnouncementTestOptions(parseVoiceAnnouncerSettings({}));

  // شش آرگومان مستقیم native؛ هیچ تنظیم ذخیره‌شده‌ای جای متن جاری را نمی‌گیرد.
  assert.deepEqual(
    Object.keys(options).sort(),
    ['amountToman', 'chimeEnabled', 'engine', 'gender', 'rate', 'template'].sort(),
  );

  assert.equal(options.engine, 'neural');
  assert.equal(options.chimeEnabled, true);
  assert.equal(options.rate, 1);
  assert.equal(options.amountToman, 70_000);

  const local = buildVoiceAnnouncementTestOptions(
    parseVoiceAnnouncerSettings({}),
    70_000,
    'local',
  );
  assert.equal(local.engine, 'local');
  assert.deepEqual(Object.keys(local).sort(), Object.keys(options).sort());
});

test('the synced config carries service, template and rate', () => {
  const db = createNodeDatabase();
  migrate(db);

  setSetting(db, VOICE_ANNOUNCER_SERVICE_KEY, 'neural');
  setSetting(db, VOICE_ANNOUNCER_TEMPLATE_KEY, '{name} {amount} تومن زد به کارتت');
  setSetting(db, VOICE_ANNOUNCER_RATE_KEY, '1.1');

  const payload = JSON.parse(buildVoiceConfigJson(db));
  assert.equal(payload.service, 'neural');
  assert.equal(payload.template, '{نام} {مبلغ} تومن زد به کارتت');
  assert.equal(payload.rate, 1.1);
  assert.deepEqual(payload.senders, []);
  assert.deepEqual(payload.accounts, []);
});
