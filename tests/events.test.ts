import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DB_CHANGE_COALESCE_MS,
  flushDbChangeCoalesced,
  hasPendingDbChangeFlush,
  notifyDbChange,
  resetDbChangeListeners,
  subscribeDbChange,
  subscribeDbChangeCoalesced,
} from '../src/db/events';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('a burst of database writes triggers a single coalesced refresh', async () => {
  resetDbChangeListeners();

  let immediate = 0;
  let coalesced = 0;
  subscribeDbChange(() => {
    immediate += 1;
  });
  const unsubscribe = subscribeDbChangeCoalesced(() => {
    coalesced += 1;
  });

  // مثل همگام‌سازی انبوه پیامک: ده‌ها درج پشت سر هم
  for (let index = 0; index < 25; index += 1) {
    notifyDbChange();
  }

  assert.equal(immediate, 25, 'شنونده‌ی همگام مثل قبل هر رویداد را می‌بیند');
  assert.equal(coalesced, 0, 'تا پایان پنجره‌ی ادغام چیزی صدا زده نمی‌شود');
  assert.equal(hasPendingDbChangeFlush(), true);

  await delay(DB_CHANGE_COALESCE_MS + 60);

  assert.equal(coalesced, 1, '۲۵ رویداد باید فقط یک بار تازه‌سازی بدهند');
  assert.equal(hasPendingDbChangeFlush(), false);

  unsubscribe();
  resetDbChangeListeners();
});

test('each new event restarts the coalescing window', async () => {
  resetDbChangeListeners();

  let coalesced = 0;
  subscribeDbChangeCoalesced(() => {
    coalesced += 1;
  });

  notifyDbChange();
  await delay(DB_CHANGE_COALESCE_MS / 2);
  notifyDbChange();
  await delay(DB_CHANGE_COALESCE_MS / 2);

  assert.equal(coalesced, 0, 'رویداد دوم پنجره را جلو می‌اندازد');

  await delay(DB_CHANGE_COALESCE_MS + 40);
  assert.equal(coalesced, 1);

  resetDbChangeListeners();
});

test('a pending flush can be forced and unsubscribed listeners are dropped', () => {
  resetDbChangeListeners();

  let coalesced = 0;
  const unsubscribe = subscribeDbChangeCoalesced(() => {
    coalesced += 1;
  });

  notifyDbChange();
  flushDbChangeCoalesced();
  assert.equal(coalesced, 1, 'flush دستی باید بی‌درنگ اجرا کند');
  assert.equal(hasPendingDbChangeFlush(), false);

  unsubscribe();
  notifyDbChange();
  flushDbChangeCoalesced();
  assert.equal(coalesced, 1, 'شنونده‌ی لغوشده دیگر صدا زده نمی‌شود');

  resetDbChangeListeners();
});

test('a broken coalesced listener does not block the others', () => {
  resetDbChangeListeners();

  let healthy = 0;
  subscribeDbChangeCoalesced(() => {
    throw new Error('boom');
  });
  subscribeDbChangeCoalesced(() => {
    healthy += 1;
  });

  notifyDbChange();
  flushDbChangeCoalesced();

  assert.equal(healthy, 1);

  resetDbChangeListeners();
  assert.equal(hasPendingDbChangeFlush(), false);
});
