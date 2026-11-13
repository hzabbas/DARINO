import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquireIngestLock,
  ingestBankSms,
  isIngestRunning,
  resetIngestLock,
} from '../src/features/smsIngest';
import { createBankAccount } from '../src/db/bankAccounts';
import { migrate } from '../src/db/migrate';
import { countPendingSms } from '../src/db/pendingSms';
import type { SqlDatabase } from '../src/types/models';
import { createNodeDatabase } from './helpers/nodeDatabase';

const BLU_EXPENSE =
  'بلو\nبرداشت زند\nعباس عزیز، 1,611,500 ریال از حساب شما پرید.\nو 88,500 ریال هم رند شد.\nموجودی: 3,529,970 ریال';

function setup(): SqlDatabase {
  const db = createNodeDatabase();
  migrate(db);
  createBankAccount(db, {
    bank_code: 'blu',
    title: 'بلوبانک شخصی',
    senders: ['09999987641'],
    initial_balance: 5_000_000,
  });
  return db;
}

test('the ingest lock only lets one sync run at a time', () => {
  resetIngestLock();
  assert.equal(isIngestRunning(), false);

  const release = acquireIngestLock();
  assert.ok(release, 'اجرای اول باید قفل بگیرد');
  assert.equal(isIngestRunning(), true);

  assert.equal(acquireIngestLock(), null, 'اجرای دوم باید رد شود');
  assert.equal(isIngestRunning(), true);

  release?.();
  assert.equal(isIngestRunning(), false);

  // آزاد کردن دوباره نباید قفل یک اجرای فعال دیگر را باز کند
  const second = acquireIngestLock();
  assert.ok(second);
  release?.();
  assert.equal(isIngestRunning(), true, 'release تکراری نباید قفل را باز کند');
  second?.();
  assert.equal(isIngestRunning(), false);
});

test('a rejected concurrent sync leaves no duplicate pending records', () => {
  const db = setup();
  resetIngestLock();

  const release = acquireIngestLock();
  assert.ok(release);

  // همان پیامک دو بار (شبیه‌سازی مسابقه‌ی mount + AppState) نباید دو ردیف بسازد
  ingestBankSms(db, { sender: '09999987641', body: BLU_EXPENSE });
  ingestBankSms(db, { sender: '09999987641', body: BLU_EXPENSE });

  assert.equal(countPendingSms(db), 1);
  assert.equal(acquireIngestLock(), null);

  release?.();
  assert.equal(isIngestRunning(), false);
});
