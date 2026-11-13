import assert from 'node:assert/strict';
import test from 'node:test';

import { createBankAccount } from '../src/db/bankAccounts';
import { listCategories } from '../src/db/categories';
import { migrate } from '../src/db/migrate';
import { approvePendingSms, listPendingSms } from '../src/db/pendingSms';
import { listTransactions } from '../src/db/transactions';
import {
  loadMerchantHistory,
  normalizeForMatch,
  suggestCategory,
  suggestFromHistory,
  suggestFromKeywords,
  significantTokens,
} from '../src/features/categorySuggest';
import { ingestBankSms } from '../src/features/smsIngest';
import type { SqlDatabase } from '../src/types/models';
import { cleanMerchant, extractMerchant, parseBankSms } from '../src/utils/smsParser';
import { createNodeDatabase } from './helpers/nodeDatabase';

const POS_SMS = 'خرید از فروشگاه افق کوروش\nمبلغ: 1,250,000 ریال\nمانده: 8,750,000 ریال';
const ONLINE_SMS = 'خرید اینترنتی دیجی‌کالا\nمبلغ: 4,300,000 ریال\nمانده: 4,450,000 ریال';
const CARD_SMS = 'انتقال کارت به کارت به علی رضایی\nمبلغ: 2,000,000 ریال';
const PAYA_SMS = 'انتقال پایا به شرکت پارس خودرو\nمبلغ: 30,000,000 ریال';
const ATM_SMS = 'برداشت از خودپرداز میدان آزادی\nمبلغ: 500,000 ریال';
const SALARY_SMS = 'واریز حقوق\nمبلغ: 45,000,000 ریال';

function setup(): SqlDatabase {
  const db = createNodeDatabase();
  migrate(db);
  createBankAccount(db, {
    bank_code: 'saman',
    title: 'حساب اصلی',
    senders: ['B.SAMAN'],
    initial_balance: 10_000_000,
  });
  return db;
}

function categoryId(db: SqlDatabase, name: string, type: 'expense' | 'income'): number {
  const category = listCategories(db, type).find((item) => item.name === name);
  assert.ok(category, `دسته‌بندی «${name}» پیدا نشد`);
  return category.id;
}

test('merchant and channel are extracted from the common sms shapes', () => {
  assert.deepEqual(extractMerchant('خرید از فروشگاه افق کوروش ۱۲۳۴'), {
    merchant: 'افق کوروش',
    channel: 'pos',
  });
  assert.deepEqual(extractMerchant('خرید اینترنتی دیجی کالا'), {
    merchant: 'دیجی کالا',
    channel: 'online',
  });
  assert.deepEqual(extractMerchant('انتقال کارت به کارت به علی رضایی'), {
    merchant: 'علی رضایی',
    channel: 'card',
  });
  assert.deepEqual(extractMerchant('انتقال پایا به شرکت پارس خودرو'), {
    merchant: 'شرکت پارس خودرو',
    channel: 'paya',
  });
  assert.deepEqual(extractMerchant('برداشت از خودپرداز میدان آزادی'), {
    merchant: 'میدان آزادی',
    channel: 'atm',
  });
  assert.deepEqual(extractMerchant('واریز حقوق'), { merchant: 'حقوق', channel: null });

  // پیامک بدون نام فروشنده نباید حدس بزند
  assert.deepEqual(extractMerchant('مانده: 116,556\n08/20 21:53'), {
    merchant: null,
    channel: null,
  });
});

test('merchant names are cleaned of card masks, digits and noise', () => {
  assert.equal(cleanMerchant('  افق کوروش ۱۲۳۴ '), 'افق کوروش');
  assert.equal(cleanMerchant('دیجی‌کالا*5'), 'دیجی‌کالا', 'کاراکترهای ماسک کارت پاک می‌شوند');
  assert.equal(cleanMerchant('حساب'), null, 'کلمه‌ی بی‌معنی نباید فروشنده شود');
  assert.equal(cleanMerchant(''), null);
  assert.equal(cleanMerchant('123456'), null);
  assert.equal(cleanMerchant('۱۲۳'), null);
});

test('parsed sms carries the merchant and channel', () => {
  const parsed = parseBankSms({ sender: 'B.SAMAN', body: POS_SMS });

  assert.equal(parsed.kind, 'transaction');
  assert.equal(parsed.merchant, 'افق کوروش');
  assert.equal(parsed.channel, 'pos');
  assert.equal(parsed.amount, 125_000);
});

test('otp messages never carry a merchant', () => {
  const parsed = parseBankSms({
    sender: 'B.QMEHRIRAN',
    body: 'انتقال به 621986*4012\n3,000,000 ریال\nرمز 951038',
  });

  assert.equal(parsed.kind, 'otp');
  assert.equal(parsed.merchant, null);
  assert.equal(parsed.channel, null);
});

test('keyword matching maps a merchant to the closest category name', () => {
  const db = setup();

  const fuel = suggestFromKeywords(db, { type: 'expense', merchant: 'پمپ بنزین شهر' });
  assert.equal(fuel?.categoryId, categoryId(db, 'بنزین و سوخت خودرو', 'expense'));
  assert.ok(fuel && fuel.score > 0);

  const wash = suggestFromKeywords(db, { type: 'expense', body: 'خرید کارواش ژیان 150,000 ریال' });
  assert.equal(wash?.categoryId, categoryId(db, 'کارواش', 'expense'));

  const salary = suggestFromKeywords(db, { type: 'income', body: SALARY_SMS });
  assert.equal(salary?.categoryId, categoryId(db, 'حقوق و درآمد ماهانه', 'income'));

  // متن بی‌ربط نباید پیشنهاد بسازد
  assert.equal(suggestFromKeywords(db, { type: 'expense', body: 'مانده: 116,556' }), null);
});

test('history beats keywords and picks the most used category', () => {
  const db = setup();
  const fuel = categoryId(db, 'بنزین و سوخت خودرو', 'expense');
  const other = categoryId(db, 'سایر هزینه‌های متفرقه', 'expense');

  const history = [
    { note: 'افق کوروش', categoryId: fuel },
    { note: 'افق کوروش شعبه مرکزی', categoryId: fuel },
    { note: 'افق کوروش', categoryId: other },
  ];

  const fromHistory = suggestFromHistory(history, 'افق کوروش');
  assert.equal(fromHistory?.categoryId, fuel, 'تطابق کامل وزن بیشتری دارد');
  assert.equal(suggestFromHistory(history, 'فروشگاه ناشناخته'), null);
  assert.equal(suggestFromHistory(history, null), null);

  const suggestion = suggestCategory(db, {
    merchant: 'افق کوروش',
    type: 'expense',
    body: POS_SMS,
    history,
  });
  assert.equal(suggestion?.categoryId, fuel);
  assert.equal(suggestion?.source, 'history');
  assert.ok(suggestion?.reason.includes('افق کوروش'));
});

test('ingesting a sms stores the merchant and a category suggestion', () => {
  const db = setup();

  const result = ingestBankSms(db, { sender: 'B.SAMAN', body: POS_SMS });

  assert.equal(result.status, 'queued');
  assert.equal(result.parsed.merchant, 'افق کوروش');
  assert.equal(result.suggestion?.source, 'keyword');

  const pending = listPendingSms(db)[0];
  assert.equal(pending.merchant, 'افق کوروش');
  // «افق کوروش» سوپرمارکت است؛ با کلیدواژه‌های فروشنده‌های شناخته‌شده به
  // «خوراک و مواد غذایی» می‌رسد، نه به دسته‌ی خودرو
  assert.equal(pending.suggested_category_id, categoryId(db, 'خوراک و مواد غذایی', 'expense'));
});

test('approving a sms records the merchant so the next one is suggested from history', () => {
  const db = setup();
  const wash = categoryId(db, 'کارواش', 'expense');

  // پیامک اول: کاربر دسته‌ی «کارواش» را انتخاب می‌کند
  const first = ingestBankSms(db, { sender: 'B.SAMAN', body: 'خرید از کارواش ژیان\nمبلغ: 150,000 ریال' });
  assert.equal(first.pending?.merchant, 'کارواش ژیان');
  approvePendingSms(db, { id: first.pending!.id, categoryId: wash });

  const transactions = listTransactions(db, null);
  assert.equal(transactions[0].note, 'کارواش ژیان', 'نام فروشنده باید در توضیح ذخیره شود');
  assert.equal(transactions[0].category_id, wash);

  // پیامک دوم از همان فروشنده: پیشنهاد باید از تاریخچه بیاید
  const second = ingestBankSms(db, {
    sender: 'B.SAMAN',
    body: 'خرید از کارواش ژیان\nمبلغ: 200,000 ریال',
  });

  assert.equal(second.suggestion?.source, 'history');
  assert.equal(second.suggestion?.categoryId, wash);
  assert.equal(listPendingSms(db)[0].suggested_category_id, wash);

  const history = loadMerchantHistory(db, 'expense');
  assert.equal(history[0].note, 'کارواش ژیان');
  assert.equal(history[0].categoryId, wash);
});

test('merchant matching ignores persian digits, punctuation and spacing', () => {
  assert.equal(normalizeForMatch('دیجی‌کالا ۱۴۰۲'), 'دیجی کالا');
  assert.equal(normalizeForMatch('افق  کوروش!'), 'افق کوروش');
  assert.equal(normalizeForMatch(''), '');
  assert.deepEqual(significantTokens('خرید از فروشگاه افق کوروش'), ['فروشگاه', 'افق', 'کوروش']);
});

test('a known iranian merchant name reaches the right category on the first sms', () => {
  const db = setup();

  // سوپرمارکت: هیچ توکن مشترکی با نام دسته‌بندی ندارد، ولی فروشنده‌ی شناخته‌شده است
  const supermarket = suggestFromKeywords(db, {
    type: 'expense',
    merchant: 'افق کوروش',
    body: POS_SMS,
  });
  assert.equal(supermarket?.categoryId, categoryId(db, 'خوراک و مواد غذایی', 'expense'));

  // «قبض» با «قبوض» هم‌پوشانی دارد
  const bill = suggestFromKeywords(db, {
    type: 'expense',
    body: 'پرداخت قبض برق\nمبلغ: 2,500,000 ریال',
  });
  assert.equal(bill?.categoryId, categoryId(db, 'قبوض و هزینه‌های منزل', 'expense'));
});

test('an sms with no recognizable merchant still parses like before', () => {
  const db = setup();
  const result = ingestBankSms(db, {
    sender: 'B.SAMAN',
    body: 'برداشت\nمبلغ: 500,000 ریال\nمانده: 9,500,000 ریال',
  });

  assert.equal(result.status, 'queued');
  assert.equal(result.parsed.merchant, null);
  assert.equal(result.suggestion, null);
  assert.equal(listPendingSms(db)[0].merchant, null);
});

test('every sms shape from the fixtures extracts the expected channel', () => {
  const cases: [string, string, string | null, string | null][] = [
    [POS_SMS, 'expense', 'افق کوروش', 'pos'],
    [ONLINE_SMS, 'expense', 'دیجی کالا', 'online'],
    [CARD_SMS, 'expense', 'علی رضایی', 'card'],
    [PAYA_SMS, 'expense', 'شرکت پارس خودرو', 'paya'],
    [ATM_SMS, 'expense', 'میدان آزادی', 'atm'],
    [SALARY_SMS, 'income', 'حقوق', null],
  ];

  for (const [body, expectedType, merchant, channel] of cases) {
    const parsed = parseBankSms({ sender: 'B.SAMAN', body });
    assert.equal(parsed.type, expectedType, body);
    assert.equal(parsed.merchant, merchant, body);
    assert.equal(parsed.channel, channel, body);
  }
});
