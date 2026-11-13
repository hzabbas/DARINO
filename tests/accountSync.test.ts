import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTransactionDelta,
  createBankAccount,
  getBankAccount,
  isBeforeSyncWindow,
  isPostBalanceAnchor,
  oldestSyncFrom,
  startOfLocalDay,
  syncFromForWindow,
  syncWindowKeyFor,
  totalBankBalance,
  updateBankAccount,
} from '../src/db/bankAccounts';
import { deleteCategoryWithTransactions, listCategories } from '../src/db/categories';
import { migrate } from '../src/db/migrate';
import {
  approvePendingSms,
  clearPendingSmsQueue,
  countPendingSms,
  countPendingSmsBefore,
  ignorePendingSmsBefore,
  insertPendingSms,
  listPendingSms,
  mergePendingSmsWithTransaction,
  pendingSmsTimestamp,
} from '../src/db/pendingSms';
import { factoryReset, resetTransactionsAndBalances } from '../src/db/reset';
import {
  countTransactions,
  createTransaction,
  deleteTransaction,
  findDuplicateCandidates,
  getSummary,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '../src/db/transactions';
import { ingestBankSms } from '../src/features/smsIngest';
import type { SqlDatabase } from '../src/types/models';
import { toLocalIso } from '../src/utils/jalali';
import { createNodeDatabase } from './helpers/nodeDatabase';

/** پیامک واقعی بلوبانک با «مانده» اعلامی در ریال */
const BLU_EXPENSE =
  'بلو\nبرداشت زند\nعباس عزیز، 1,611,500 ریال از حساب شما پرید.\nو 88,500 ریال هم رند شد.\nموجودی: 3,529,970 ریال';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function setup(): { db: SqlDatabase; accountId: number } {
  const db = createNodeDatabase();
  migrate(db);
  const accountId = createBankAccount(db, {
    bank_code: 'blu',
    title: 'بلوبانک شخصی',
    senders: ['09999987641'],
    current_balance: 5_000_000,
  });
  return { db, accountId };
}

function expenseCategoryId(db: SqlDatabase): number {
  const category = listCategories(db, 'expense')[0];
  if (!category) throw new Error('دسته‌بندی پیش‌فرض پیدا نشد');
  return category.id;
}

/** مهر زمانی ISO محلی برای «الان منهای n روز» */
function isoDaysAgo(days: number): string {
  return toLocalIso(new Date(Date.now() - days * DAY));
}

test('sync windows turn into timestamps and round-trip back to their key', () => {
  const now = Date.now();
  assert.equal(syncFromForWindow(0, now), now, '«از این لحظه به بعد» یعنی همین حالا');
  assert.equal(syncFromForWindow(24, now), now - DAY);
  assert.equal(syncFromForWindow(24 * 7, now), now - 7 * DAY);

  assert.equal(syncWindowKeyFor(now, now), 'now');
  assert.equal(syncWindowKeyFor(now - DAY, now), '24h');
  assert.equal(syncWindowKeyFor(now - 6 * DAY, now), '7d');
});

test('a fresh account only reads sms from this moment on', () => {
  const db = createNodeDatabase();
  migrate(db);

  const accountId = createBankAccount(db, {
    bank_code: 'blu',
    title: 'بلوبانک',
    senders: ['09999987641'],
    current_balance: 4_130_000,
  });
  const account = getBankAccount(db, accountId);
  assert.ok(account);
  assert.ok(account.sync_from_ts > 0, 'مرز همگام‌سازی باید پر شود');
  assert.equal(account.sync_from_ts, account.balance_anchor_ts);

  // پیامک پنج روز قبل: نباید صف تایید را پر کند (همان مشکل «۴۸ پیامک قدیمی»)
  const old = ingestBankSms(db, {
    sender: '09999987641',
    body: BLU_EXPENSE,
    receivedAt: new Date(Date.now() - 5 * DAY),
  });
  assert.equal(old.status, 'before-sync-window');
  assert.equal(old.pending, null);
  assert.equal(countPendingSms(db), 0, 'پیامک قدیمی نباید وارد صف شود');
  assert.equal(getBankAccount(db, accountId)?.current_balance, 4_130_000, 'موجودی دست‌نخورده');

  // پیامک همین حالا: وارد صف می‌شود
  const fresh = ingestBankSms(db, {
    sender: '09999987641',
    body: BLU_EXPENSE,
    receivedAt: new Date(),
  });
  assert.equal(fresh.status, 'queued');
  assert.equal(countPendingSms(db), 1);
});

test('the sync boundary is inclusive: an sms exactly at the boundary is read', () => {
  const db = createNodeDatabase();
  migrate(db);

  const boundary = Date.now();
  const accountId = createBankAccount(db, {
    bank_code: 'blu',
    title: 'بلوبانک',
    senders: ['09999987641'],
    sync_from_ts: boundary,
  });
  const account = getBankAccount(db, accountId);
  assert.ok(account);
  assert.equal(isBeforeSyncWindow(account, new Date(boundary)), false);
  assert.equal(isBeforeSyncWindow(account, new Date(boundary - 1)), true);
});

test('the parsed bank balance is the single source of truth and moves the anchor', () => {
  const { db, accountId } = setup();

  const receivedAt = new Date();
  const result = ingestBankSms(db, { sender: '09999987641', body: BLU_EXPENSE, receivedAt });

  assert.equal(result.status, 'queued');
  assert.ok(result.parsed.balance !== null && result.parsed.balance > 0);

  const account = getBankAccount(db, accountId);
  assert.ok(account);
  assert.equal(account.current_balance, result.parsed.balance, 'مانده‌ی پیامک باید مرجع باشد');
  assert.equal(account.balance_anchor_ts, receivedAt.getTime(), 'لنگر به لحظه‌ی پیامک می‌رود');
});

test('opening a bank account never shows up as income', () => {
  const db = createNodeDatabase();
  migrate(db);

  createBankAccount(db, {
    bank_code: 'blu',
    title: 'بلوبانک',
    initial_balance: 5_000_000,
    current_balance: 7_000_000,
  });

  // موجودی حساب یک «دارایی» است و در سود خالص دوره‌ای هیچ‌وقت نمی‌آید
  assert.equal(totalBankBalance(db), 7_000_000);
  assert.deepEqual(getSummary(db, null), { income: 0, expense: 0, balance: 0 });
  assert.equal(countTransactions(db), 0);
  assert.equal(countTransactionsAndPending(db), 0);
});

test('a manual transaction without a bank link never moves a balance', () => {
  const { db, accountId } = setup();
  const before = getBankAccount(db, accountId)?.current_balance ?? 0;

  createTransaction(db, {
    amount: 300_000,
    type: 'expense',
    category_id: expenseCategoryId(db),
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  assert.equal(getBankAccount(db, accountId)?.current_balance, before, 'تراکنش دستی بی‌حساب است');
  assert.deepEqual(getSummary(db, null), { income: 0, expense: 300_000, balance: -300_000 });
});

test('transactions from before the balance anchor do not double-count', () => {
  const { db, accountId } = setup();
  const anchor = getBankAccount(db, accountId)?.balance_anchor_ts ?? 0;
  const before = getBankAccount(db, accountId)?.current_balance ?? 0;
  const categoryId = expenseCategoryId(db);

  // تراکنش سه روز قبل که کاربر پیش از وصل‌کردن حساب ثبت کرده بود
  createTransaction(db, {
    amount: 250_000,
    type: 'expense',
    category_id: categoryId,
    date: isoDaysAgo(3),
    shamsi_date: '۱۴۰۵/۰۸/۱۹',
    bank_account_id: accountId,
  });
  assert.equal(
    getBankAccount(db, accountId)?.current_balance,
    before,
    'تراکنش قدیمی‌تر از لنگر نباید موجودی را عوض کند',
  );

  // و تراکنش همین روز (حتی با ساعتی قبل از لنگر) باید اعمال شود
  // برای جلوگیری از عبور از نیمه‌شب در اجراهای نیمه‌شب، لنگر را روی ظهر روز قرار می‌دهیم
  const midDayAnchor = startOfLocalDay(anchor) + 12 * HOUR;
  updateBankAccount(db, accountId, { balance_anchor_ts: midDayAnchor });
  const sameDay = new Date(midDayAnchor - HOUR);
  createTransaction(db, {
    amount: 100_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(sameDay),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  assert.equal(getBankAccount(db, accountId)?.current_balance, before - 100_000);
});

test('editing a linked transaction reverses the old impact and applies the new one', () => {
  const { db, accountId } = setup();
  const otherId = createBankAccount(db, { bank_code: 'mellat', title: 'ملت', current_balance: 2_000_000 });
  const categoryId = expenseCategoryId(db);
  const start = getBankAccount(db, accountId)?.current_balance ?? 0;

  const id = createTransaction(db, {
    amount: 500_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  assert.equal(getBankAccount(db, accountId)?.current_balance, start - 500_000);

  // تغییر مبلغ
  updateTransaction(db, id, {
    amount: 700_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  assert.equal(getBankAccount(db, accountId)?.current_balance, start - 700_000);

  // تغییر نوع به درآمد
  updateTransaction(db, id, {
    amount: 700_000,
    type: 'income',
    category_id: listCategories(db, 'income')[0].id,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  assert.equal(getBankAccount(db, accountId)?.current_balance, start + 700_000);

  // انتقال به حساب دیگر: اثر از حساب قبلی برداشته و روی حساب جدید می‌نشیند
  updateTransaction(db, id, {
    amount: 700_000,
    type: 'income',
    category_id: listCategories(db, 'income')[0].id,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: otherId,
  });
  assert.equal(getBankAccount(db, accountId)?.current_balance, start, 'حساب قبلی باید برگردد');
  assert.equal(getBankAccount(db, otherId)?.current_balance, 2_000_000 + 700_000);

  // برداشتن اتصال حساب: اثر از حساب دوم هم برداشته می‌شود
  updateTransaction(db, id, {
    amount: 700_000,
    type: 'income',
    category_id: listCategories(db, 'income')[0].id,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: null,
  });
  assert.equal(getBankAccount(db, otherId)?.current_balance, 2_000_000);
});

test('deleting a linked transaction gives the balance back', () => {
  const { db, accountId } = setup();
  const before = getBankAccount(db, accountId)?.current_balance ?? 0;

  const id = createTransaction(db, {
    amount: 120_000,
    type: 'income',
    category_id: listCategories(db, 'income')[0].id,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  assert.equal(getBankAccount(db, accountId)?.current_balance, before + 120_000);

  deleteTransaction(db, id);
  assert.equal(getBankAccount(db, accountId)?.current_balance, before);
});

test('deleting a category with transactions reverses the balance of linked transactions', () => {
  const { db, accountId } = setup();
  const categoryId = expenseCategoryId(db);
  const before = getBankAccount(db, accountId)?.current_balance ?? 0;

  createTransaction(db, {
    amount: 150_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });

  assert.equal(getBankAccount(db, accountId)?.current_balance, before - 150_000);

  deleteCategoryWithTransactions(db, categoryId);

  // موجودی حساب باید اثر تراکنش‌های حذف‌شده را پس بگیرد
  assert.equal(getBankAccount(db, accountId)?.current_balance, before);
});

test('editing the balance by hand moves the anchor forward', () => {
  const { db, accountId } = setup();
  const before = getBankAccount(db, accountId);
  assert.ok(before);

  updateBankAccount(db, accountId, { current_balance: 9_000_000 });
  const after = getBankAccount(db, accountId);
  assert.ok(after);
  assert.equal(after.current_balance, 9_000_000);
  assert.ok(after.balance_anchor_ts >= before.balance_anchor_ts);

  // و ویرایشی که موجودی را دست نمی‌زند، لنگر را جلو نمی‌برد
  updateBankAccount(db, accountId, { title: 'بلوبانک من' });
  assert.equal(getBankAccount(db, accountId)?.balance_anchor_ts, after.balance_anchor_ts);
});

test('approving a queued sms records the bank balance as the new truth', () => {
  const { db, accountId } = setup();
  const receivedAt = new Date(Date.now() - 30 * 60 * 1000);

  const { row } = insertPendingSms(db, {
    sms_id: 'sms-balance-1',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: BLU_EXPENSE,
    detected_type: 'expense',
    amount: 161_150,
    detected_balance: 3_529_997,
    date: toLocalIso(receivedAt),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    merchant: 'فروشگاه',
  });
  assert.ok(row);

  assert.equal(approvePendingSms(db, { id: row.id, categoryId: expenseCategoryId(db) }), true);

  const account = getBankAccount(db, accountId);
  assert.ok(account);
  assert.equal(account.current_balance, 3_529_997, 'مانده‌ی پیامک مرجع است');
  assert.equal(account.balance_anchor_ts, pendingSmsTimestamp(row));

  // تراکنش ساخته‌شده به حساب وصل است تا در فیلتر «تراکنش‌های بانکی» بیاید
  const linked = listTransactions(db, null, -1, { bankLink: 'linked' });
  assert.equal(linked.length, 1);
  assert.equal(linked[0].category_name, listCategories(db, 'expense')[0].name);
});

test('duplicate candidates match amount and type inside the 36 hour window', () => {
  const { db, accountId } = setup();
  const categoryId = expenseCategoryId(db);
  const center = new Date();

  const target = createTransaction(db, {
    amount: 570_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date(center.getTime() - 4 * HOUR)),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    note: 'فعالیت در اسنپ',
  });
  createTransaction(db, {
    amount: 570_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date(center.getTime() - 60 * HOUR)),
    shamsi_date: '۱۴۰۵/۰۸/۲۰',
  });
  createTransaction(db, {
    amount: 900_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(center),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });
  createTransaction(db, {
    amount: 570_000,
    type: 'income',
    category_id: listCategories(db, 'income')[0].id,
    date: toLocalIso(center),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  const matches = findDuplicateCandidates(db, {
    amount: 570_000,
    type: 'expense',
    dateIso: toLocalIso(center),
  });

  assert.equal(matches.length, 1, 'فقط همان مبلغ/نوع داخل پنجره');
  assert.equal(matches[0].id, target);
  assert.equal(matches[0].note, 'فعالیت در اسنپ');
  assert.ok(matches[0].hoursApart < 5);

  // پنجره‌ی بزرگ‌تر، تراکنش قدیمی‌تر را هم پیدا می‌کند
  const wide = findDuplicateCandidates(db, {
    amount: 570_000,
    type: 'expense',
    dateIso: toLocalIso(center),
    windowHours: 72,
  });
  assert.equal(wide.length, 2);

  assert.equal(typeof accountId, 'number', 'حساب بانکی در این تست بی‌استفاده است');
});

test('merging a pending sms with the manual transaction avoids a duplicate', () => {
  const { db, accountId } = setup();
  const categoryId = expenseCategoryId(db);
  const receivedAt = new Date();

  // کاربر صبح همان هزینه را دستی ثبت کرده بود
  const manualId = createTransaction(db, {
    amount: 570_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date(receivedAt.getTime() - 2 * HOUR)),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    note: 'اسنپ',
  });
  const balanceBefore = getBankAccount(db, accountId)?.current_balance ?? 0;

  const { row } = insertPendingSms(db, {
    sms_id: 'sms-merge-1',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: BLU_EXPENSE,
    detected_type: 'expense',
    amount: 570_000,
    detected_balance: 4_000_000,
    date: toLocalIso(receivedAt),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    merchant: 'اسنپ',
  });
  assert.ok(row);

  const result = mergePendingSmsWithTransaction(db, { pendingId: row.id, transactionId: manualId });

  assert.equal(result.merged, true);
  assert.equal(result.transactionId, manualId);
  assert.equal(result.balanceApplied, true, 'مانده‌ی پیامک اعمال می‌شود');
  assert.equal(countTransactions(db), 1, 'تراکنش تکراری ساخته نمی‌شود');
  assert.equal(getBankAccount(db, accountId)?.current_balance, 4_000_000);

  const merged = getTransaction(db, manualId);
  assert.equal(merged?.bank_account_id, accountId, 'تراکنش موجود به حساب وصل می‌شود');
  assert.equal(merged?.amount, 570_000, 'مبلغ دست‌نخورده می‌ماند');
  assert.equal(listPendingSms(db, 'pending').length, 0, 'پیامک تایید می‌شود');
  assert.equal(balanceBefore === 4_000_000, false, 'موجودی قبلی جای دیگری بود');
});

test('merging a pending sms into a transaction previously linked to another account reverses the old account balance', () => {
  const { db, accountId } = setup();
  const otherId = createBankAccount(db, {
    bank_code: 'pasargad',
    title: 'پاسارگاد',
    current_balance: 2_000_000,
  });
  const categoryId = expenseCategoryId(db);
  const receivedAt = new Date();

  // کاربر تراکنشی را با حساب قبلی (otherId) ثبت کرده بود
  const oldOtherBalance = getBankAccount(db, otherId)?.current_balance ?? 0;
  const manualId = createTransaction(db, {
    amount: 200_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(receivedAt),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: otherId,
  });
  assert.equal(getBankAccount(db, otherId)?.current_balance, oldOtherBalance - 200_000);

  // حالا پیامکی از حساب اولی (accountId) می‌آید
  const { row } = insertPendingSms(db, {
    sms_id: 'sms-relink-1',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'برداشت',
    detected_type: 'expense',
    amount: 200_000,
    detected_balance: null,
    date: toLocalIso(receivedAt),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });
  assert.ok(row);

  const initialAccountBalance = getBankAccount(db, accountId)?.current_balance ?? 0;
  mergePendingSmsWithTransaction(db, { pendingId: row.id, transactionId: manualId });

  // اثر روی حساب قبلی برگردانده شده و روی حساب جدید اعمال شده است
  assert.equal(getBankAccount(db, otherId)?.current_balance, oldOtherBalance);
  assert.equal(getBankAccount(db, accountId)?.current_balance, initialAccountBalance - 200_000);
});

test('merging twice or merging a transfer is refused', () => {
  const { db, accountId } = setup();
  const categoryId = expenseCategoryId(db);
  const txId = createTransaction(db, {
    amount: 100_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  const { row } = insertPendingSms(db, {
    sms_id: 'sms-merge-2',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'انتقال',
    detected_type: 'expense',
    amount: 100_000,
    detected_balance: null,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });
  assert.ok(row);

  assert.equal(mergePendingSmsWithTransaction(db, { pendingId: row.id, transactionId: txId }).merged, true);
  // بار دوم: پیامک دیگر «منتظر» نیست
  assert.equal(mergePendingSmsWithTransaction(db, { pendingId: row.id, transactionId: txId }).merged, false);
  assert.equal(countTransactions(db), 1);
});

test('merging does not apply the delta twice when the transaction is already linked', () => {
  const { db, accountId } = setup();
  const categoryId = expenseCategoryId(db);

  const txId = createTransaction(db, {
    amount: 200_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  const afterCreate = getBankAccount(db, accountId)?.current_balance ?? 0;

  const { row } = insertPendingSms(db, {
    sms_id: 'sms-merge-3',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'برداشت',
    detected_type: 'expense',
    amount: 200_000,
    detected_balance: null,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });
  assert.ok(row);

  const result = mergePendingSmsWithTransaction(db, { pendingId: row.id, transactionId: txId });
  assert.equal(result.merged, true);
  assert.equal(result.balanceApplied, false, 'اثر این تراکنش قبلاً اعمال شده بود');
  assert.equal(getBankAccount(db, accountId)?.current_balance, afterCreate);
});

test('dismissing old queued sms keeps today items', () => {
  const { db, accountId } = setup();
  const today = new Date();

  insertPendingSms(db, {
    sms_id: 'old-1',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'قدیمی',
    detected_type: 'expense',
    amount: 1000,
    date: toLocalIso(new Date(today.getTime() - 3 * DAY)),
    shamsi_date: '۱۴۰۵/۰۸/۱۹',
  });
  insertPendingSms(db, {
    sms_id: 'new-1',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'امروز',
    detected_type: 'expense',
    amount: 2000,
    date: toLocalIso(today),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  assert.equal(countPendingSmsBefore(db, startOfToday), 1);
  assert.equal(ignorePendingSmsBefore(db, startOfToday), 1);

  const remaining = listPendingSms(db, 'pending');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].sms_id, 'new-1');
});

test('clearing the queue touches nothing else', () => {
  const { db, accountId } = setup();
  const categoryId = expenseCategoryId(db);
  createTransaction(db, {
    amount: 90_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });
  insertPendingSms(db, {
    sms_id: 'queue-1',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'صف',
    detected_type: 'expense',
    amount: 5000,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  const removed = clearPendingSmsQueue(db);

  assert.equal(removed, 1);
  assert.equal(countPendingSms(db), 0);
  assert.equal(countTransactions(db), 1, 'تراکنش‌ها دست‌نخورده');
  assert.equal(totalBankBalance(db), 5_000_000, 'موجودی‌ها دست‌نخورده');
  assert.ok(getBankAccount(db, accountId), 'حساب بانکی دست‌نخورده');
});

test('resetting transactions zeroes balances but keeps accounts and categories', () => {
  const { db, accountId } = setup();
  const categoryId = expenseCategoryId(db);
  const categoriesBefore = listCategories(db).length;

  createTransaction(db, {
    amount: 400_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });
  insertPendingSms(db, {
    sms_id: 'reset-1',
    sender: '09999987641',
    bank_account_id: accountId,
    raw_body: 'صف',
    detected_type: 'expense',
    amount: 5000,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
  });

  const summary = resetTransactionsAndBalances(db);

  assert.equal(summary.transactions, 1);
  assert.equal(summary.pendingSms, 1);
  assert.equal(summary.accountsZeroed, 1);
  assert.equal(countTransactions(db), 0);
  assert.equal(countPendingSms(db), 0);
  assert.equal(totalBankBalance(db), 0, 'موجودی صفر می‌شود');
  assert.ok(getBankAccount(db, accountId), 'تعریف حساب بانکی می‌ماند');
  assert.equal(listCategories(db).length, categoriesBefore, 'دسته‌بندی‌ها می‌مانند');
});

test('factory reset wipes every table and seeds the defaults again', () => {
  const { db, accountId } = setup();
  const categoryId = expenseCategoryId(db);

  createTransaction(db, {
    amount: 400_000,
    type: 'expense',
    category_id: categoryId,
    date: toLocalIso(new Date()),
    shamsi_date: '۱۴۰۵/۰۸/۲۲',
    bank_account_id: accountId,
  });

  const summary = factoryReset(db);

  assert.equal(summary.transactions, 1);
  assert.equal(summary.accounts, 1);
  assert.equal(summary.categories > 0, true);
  assert.ok(summary.seeded > 0, 'دسته‌بندی‌های پیش‌فرض دوباره ساخته می‌شوند');
  assert.equal(countTransactions(db), 0);
  assert.equal(countPendingSms(db), 0);
  assert.equal(totalBankBalance(db), 0);
  assert.equal(listPendingSms(db, 'all').length, 0);
  assert.equal(getBankAccount(db, accountId), null, 'حساب بانکی هم پاک می‌شود');
  assert.equal(listCategories(db).length, summary.seeded);
});

test('applying a delta needs both an account and a date past the anchor', () => {
  const { db, accountId } = setup();

  assert.equal(applyTransactionDelta(db, null, 1000, toLocalIso(new Date())), false);
  assert.equal(applyTransactionDelta(db, accountId, 0, toLocalIso(new Date())), false);
  assert.equal(applyTransactionDelta(db, accountId, 1000, isoDaysAgo(2)), false);
  assert.equal(applyTransactionDelta(db, accountId, 1000, 'not-a-date'), false);
  assert.equal(applyTransactionDelta(db, accountId, 1000, toLocalIso(new Date())), true);
});

test('the anchor comparison works at day level, not on milliseconds', () => {
  const { db, accountId } = setup();
  const account = getBankAccount(db, accountId);
  assert.ok(account);

  const yesterday = new Date(account.balance_anchor_ts - DAY);
  const laterToday = new Date(account.balance_anchor_ts - 60 * 1000);

  assert.equal(isPostBalanceAnchor(account, toLocalIso(yesterday)), false);
  assert.equal(isPostBalanceAnchor(account, toLocalIso(laterToday)), true);
});

test('oldestSyncFrom tells the sync which history is worth reading', () => {
  const db = createNodeDatabase();
  migrate(db);

  assert.equal(oldestSyncFrom(db), null, 'حساب فعالی وجود ندارد');

  const now = Date.now();
  createBankAccount(db, { bank_code: 'blu', title: 'الف', sync_from_ts: now });
  createBankAccount(db, { bank_code: 'mellat', title: 'ب', sync_from_ts: now - 7 * DAY });
  createBankAccount(db, { bank_code: 'saman', title: 'ج', sync_from_ts: now - 2 * DAY });

  assert.equal(oldestSyncFrom(db), now - 7 * DAY);
});

/** کمکی: هیچ داده‌ی جانبی‌ای جا نمانده باشد */
function countTransactionsAndPending(db: SqlDatabase): number {
  return countTransactions(db) + countPendingSms(db);
}
