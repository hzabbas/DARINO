import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBankAccount,
  getBankAccount,
  listBankAccounts,
  updateBankAccount,
} from '../src/db/bankAccounts';
import { migrate } from '../src/db/migrate';
import { extractPayerName } from '../src/utils/smsParser';
import {
  buildColloquialDepositSpeech,
  formatColloquialSpeechAmount,
} from '../src/utils/numberToWords';
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
