import assert from 'node:assert/strict';
import test from 'node:test';

import { createBankAccount } from '../src/db/bankAccounts';
import { migrate } from '../src/db/migrate';
import { insertPendingSms } from '../src/db/pendingSms';
import { createTransaction } from '../src/db/transactions';
import { listCategories } from '../src/db/categories';
import {
  consumePendingSmsFocus,
  isPendingSmsUrl,
  peekPendingSmsFocus,
  requestPendingSmsFocus,
  resetPendingSmsFocus,
  resolveFocusedSmsId,
  smsFingerprintFromUrl,
  subscribePendingSmsFocus,
} from '../src/features/smsFocus';
import type { SqlDatabase } from '../src/types/models';
import { toLocalIso } from '../src/utils/jalali';
import { createNodeDatabase } from './helpers/nodeDatabase';

/** پیامک تازه در صف تایید، با شناسه‌ای که خود لایه‌ی داده می‌سازد */
function queueSms(db: SqlDatabase, accountId: number, receivedAt: Date, smsId = 'sms-1'): string {
  const { row } = insertPendingSms(db, {
    sms_id: smsId,
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'بلو\nبرداشت 570,000 ریال\nموجودی: 4,130,000 ریال',
    detected_type: 'expense',
    amount: 57_000,
    detected_balance: 413_000,
    date: toLocalIso(receivedAt),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    merchant: 'اسنپ',
  });
  return row?.sms_id ?? '';
}

function setup(): { db: SqlDatabase; accountId: number } {
  const db = createNodeDatabase();
  migrate(db);
  const accountId = createBankAccount(db, {
    bank_code: 'blu',
    title: 'بلوبانک',
    senders: ['09999987641'],
  });
  return { db, accountId };
}

test('the focus signal is one-shot and notifies subscribers', () => {
  resetPendingSmsFocus();

  const seen: Array<string | null> = [];
  const unsubscribe = subscribePendingSmsFocus((focus) => seen.push(focus.smsId));

  assert.equal(peekPendingSmsFocus(), null);
  requestPendingSmsFocus('sms-42');
  assert.deepEqual(seen, ['sms-42']);
  assert.equal(peekPendingSmsFocus()?.smsId, 'sms-42');

  // مصرف، سیگنال را پاک می‌کند تا با هر رندر دوباره باز نشود
  assert.equal(consumePendingSmsFocus()?.smsId, 'sms-42');
  assert.equal(consumePendingSmsFocus(), null);

  unsubscribe();
  requestPendingSmsFocus('sms-99');
  assert.deepEqual(seen, ['sms-42'], 'بعد از لغو اشتراک، رویداد جدید نمی‌آید');
  assert.equal(peekPendingSmsFocus()?.smsId, 'sms-99');

  resetPendingSmsFocus();
  assert.equal(peekPendingSmsFocus(), null);
});

test('the deep link carries the sms fingerprint', () => {
  assert.equal(
    smsFingerprintFromUrl('darino://pending-sms?open=1&sms=09999987641%7C1763000000000'),
    '09999987641|1763000000000',
  );
  assert.equal(smsFingerprintFromUrl('darino://pending-sms?open=1'), null);
  assert.equal(smsFingerprintFromUrl('https://example.com/?sms=x'), null);
  assert.equal(smsFingerprintFromUrl(null), null);

  assert.equal(isPendingSmsUrl('darino://pending-sms?open=1&sms=a'), true);
  assert.equal(isPendingSmsUrl('darino://?openPendingSms=1'), true);
  assert.equal(isPendingSmsUrl('darino://settings'), false);
  assert.equal(isPendingSmsUrl(undefined), false);
});

test('a tapped notification resolves to the queued sms row', () => {
  const { db, accountId } = setup();
  const receivedAt = new Date(2026, 10, 13, 18, 30);
  const smsId = queueSms(db, accountId, receivedAt);
  assert.equal(smsId, 'sms-1');

  const fingerprint = `09999987641|${receivedAt.getTime()}`;
  assert.equal(resolveFocusedSmsId(db, fingerprint), 'sms-1');
  // همان امضا از راه لینک عمیق (مثل شروع warm که extra در دسترس نیست)
  assert.equal(
    resolveFocusedSmsId(db, null, `darino://pending-sms?open=1&sms=${encodeURIComponent(fingerprint)}`),
    'sms-1',
  );

  // سرشماره با شکل دیگری از همان شماره هم باید پیدا شود
  assert.equal(resolveFocusedSmsId(db, `+989999987641|${receivedAt.getTime()}`), 'sms-1');

  // امضای بی‌ربط یا پیامک تاییدشده‌ی قبلی، چیزی برنمی‌گرداند
  assert.equal(resolveFocusedSmsId(db, '09999987641|123'), null);
  assert.equal(resolveFocusedSmsId(db, 'garbage'), null);
  assert.equal(resolveFocusedSmsId(db, null), null);
});

test('already reviewed sms are not offered for focus', () => {
  const { db, accountId } = setup();
  const receivedAt = new Date(2026, 10, 13, 18, 30);
  const smsId = queueSms(db, accountId, receivedAt, 'sms-review');

  // کاربر با کد ۰ (بدون ارتباط) ردش کرد
  db.runSync("UPDATE pending_sms SET status = 'ignored' WHERE sms_id = ?", smsId);

  assert.equal(resolveFocusedSmsId(db, `09999987641|${receivedAt.getTime()}`), null);
});

test('the focus signal never creates data by itself', () => {
  const { db, accountId } = setup();
  createTransaction(db, {
    amount: 1000,
    type: 'expense',
    category_id: listCategories(db, 'expense')[0].id,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });
  void accountId;

  const before = db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM transactions');
  requestPendingSmsFocus('sms-x');
  consumePendingSmsFocus();
  const after = db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM transactions');

  assert.equal(before?.total, after?.total);
});
