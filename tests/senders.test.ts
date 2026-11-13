import assert from 'node:assert/strict';
import test from 'node:test';

import { createBankAccount, findAccountBySender } from '../src/db/bankAccounts';
import { migrate } from '../src/db/migrate';
import type { SqlDatabase } from '../src/types/models';
import {
  LTR_ISOLATE_END,
  LTR_ISOLATE_START,
  isolateLtr,
} from '../src/utils/bidi';
import {
  detectBankFromSender,
  normalizeSender,
  senderVariants,
  sendersMatch,
} from '../src/utils/iranianBanks';
import { createNodeDatabase } from './helpers/nodeDatabase';

function setup(): SqlDatabase {
  const db = createNodeDatabase();
  migrate(db);
  return db;
}

test('one iranian number has a single normalized form', () => {
  const expected = '09999987641';

  for (const form of [
    '09999987641',
    '+989999987641',
    '989999987641',
    '00989999987641',
    '+98 999 998 7641',
    '0999 998 7641',
    '0999-998-7641',
    `${LTR_ISOLATE_START}+989999987641${LTR_ISOLATE_END}`,
  ]) {
    assert.equal(normalizeSender(form), expected, `نرمال‌سازی «${form}»`);
  }

  // سرشماره‌های متنی دست‌نخورده می‌مانند (فقط کوچک می‌شوند)
  assert.equal(normalizeSender(' B.Pasargad '), 'b.pasargad');
  assert.equal(normalizeSender('BPASARGAD'), 'bpasargad');
  assert.equal(normalizeSender('30008310'), '30008310');
  assert.equal(normalizeSender(''), '');
  assert.equal(normalizeSender('   '), '');
});

test('the same account is found whatever prefix the sms uses', () => {
  assert.equal(sendersMatch('09999987641', '+989999987641'), true);
  assert.equal(sendersMatch('09999987641', '989999987641'), true);
  assert.equal(sendersMatch('09999987641', '00989999987641'), true);
  assert.equal(sendersMatch('B.Pasargad', 'B.PASARGAD'), true);
  assert.equal(sendersMatch('B.Pasargad', 'Pasargad'), true);

  // شماره‌های مختلف نباید قاطی شوند، حتی با پسوند مشترک
  assert.equal(sendersMatch('09999987641', '09999987642'), false);
  assert.equal(sendersMatch('09999987641', 'B.QMEHRIRAN'), false);
  assert.equal(sendersMatch('', '09999987641'), false);
});

test('sender variants cover every shape an inbox row can have', () => {
  const variants = senderVariants('09999987641');

  for (const expected of ['09999987641', '+989999987641', '989999987641', '00989999987641']) {
    assert.ok(variants.includes(expected), `«${expected}» باید در فهرست شکل‌ها باشد`);
  }
  assert.equal(new Set(variants).size, variants.length, 'شکل‌های تکراری نباید باشند');
  assert.deepEqual(senderVariants('B.Pasargad'), ['B.Pasargad', 'b.pasargad']);
  assert.deepEqual(senderVariants('   '), []);
});

test('a saved sender matches the incoming sms sender in every prefix form', () => {
  const db = setup();
  createBankAccount(db, {
    bank_code: 'blu',
    title: 'بلوبانک شخصی',
    senders: ['09999987641'],
  });
  createBankAccount(db, {
    bank_code: 'pasargad',
    title: 'پاسارگاد اصلی',
    senders: ['B.Pasargad'],
  });

  assert.equal(findAccountBySender(db, '+989999987641')?.title, 'بلوبانک شخصی');
  assert.equal(findAccountBySender(db, '989999987641')?.title, 'بلوبانک شخصی');
  assert.equal(findAccountBySender(db, '00989999987641')?.title, 'بلوبانک شخصی');
  assert.equal(findAccountBySender(db, '0999 998 7641')?.title, 'بلوبانک شخصی');
  assert.equal(findAccountBySender(db, `${LTR_ISOLATE_START}+989999987641${LTR_ISOLATE_END}`)?.title, 'بلوبانک شخصی');
  assert.equal(findAccountBySender(db, 'pasargad')?.title, 'پاسارگاد اصلی');
  assert.equal(findAccountBySender(db, 'B.QMEHRIRAN'), null);
  assert.equal(findAccountBySender(db, ''), null);
});

test('bank detection understands the same prefix forms', () => {
  assert.equal(detectBankFromSender('+989999987641')?.code, 'blu');
  assert.equal(detectBankFromSender('00989999987641')?.code, 'blu');
  assert.equal(detectBankFromSender('0999 998 7641')?.code, 'blu');
  assert.equal(detectBankFromSender('B.PASARGAD')?.code, 'pasargad');
});

test('isolated senders stay inside their isolate markers', () => {
  assert.ok(isolateLtr('+989999987641').startsWith(LTR_ISOLATE_START));
  assert.ok(isolateLtr('+989999987641').endsWith(LTR_ISOLATE_END));
});
