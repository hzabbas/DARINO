import assert from 'node:assert/strict';
import test from 'node:test';

import { detectBankFromSender, getBank, normalizeSender } from '../src/utils/iranianBanks';
import {
  createSmsId,
  detectSelfTransfers,
  detectSmsUnit,
  parseBankSms,
  rialToToman,
  smsValueToToman,
} from '../src/utils/smsParser';

const BLU_OTP = 'فروش مستقیم بسته-از طریق نرم افزار موبایل\nمبلغ: 1,611,500 ریال\nرمز: 884144';
const BLU_EXPENSE =
  'بلو\nبرداشت زند\nعباس عزیز، 1,611,500 ریال از حساب شما پرید.\nو 88,500 ریال هم رند شد.\nموجودی: 3,529,970 ریال';
const BLU_INCOME_POOL =
  'بلو\nدریافت پل\nعباس عزیز، 530,000 ریال به حساب شما نشست.\nموجودی: 4,059,970 ریال';
const BLU_INCOME_DEPOSIT =
  'بلو\nواریز پول\nعباس عزیز، 800,000 ریال به حساب شما نشست.\nموجودی: 4,859,970 ریال';

const PARSAGAD_INCOME = '+940,000\n08/20 10:02\nمانده: 46,596,406';
const PARSAGAD_EXPENSE_BIG = '777.888.27923610.1\n-46,025,000\n08/20 10:56\nمانده: 571,406';
const PARSAGAD_INCOME_POOL = '777.888.27923610.1\n+4,356,150\n08/20 21:25\nمانده: 4,927,556';
const PARSAGAD_EXPENSE = '777.888.27923610.1\n-4,811,000\n08/20 21:53\nمانده: 116,556';

const MEHR_OTP =
  'انتقال به 621986*4012\n3,000,000 ریال\nرمز 951038\n@ib.qmehr724.com #951038\nاعتبار 14:30:41';
const MEHR_INCOME = '300379091710\n4,800,000+\n1405/8/20-21:53\nمانده:100,812,087';
const MEHR_EXPENSE = '300379091710\n5,011,000-\n1405/8/21-16:44\nمانده:95,801,087';

test('bank directory knows the iranian banks and normalizes senders', () => {
  assert.equal(detectBankFromSender('0999 998 7641')?.code, 'blu');
  assert.equal(detectBankFromSender('B.Pasargad')?.code, 'pasargad');
  assert.equal(detectBankFromSender('B.QMEHRIRAN')?.code, 'mehr');
  assert.equal(detectBankFromSender('IRAN POST'), null);
  assert.equal(normalizeSender('B.Pasargad'), 'b.pasargad');
  assert.equal(normalizeSender('+98 999 998 7641'), '09999987641');
  assert.equal(getBank('unknown-code').code, 'other');
});

test('otp and verification messages are never transactions', () => {
  const blu = parseBankSms({ sender: '09999987641', body: BLU_OTP });
  assert.equal(blu.kind, 'otp');
  assert.equal(blu.type, null);
  assert.ok(blu.otpReason);

  const mehr = parseBankSms({ sender: 'B.QMEHRIRAN', body: MEHR_OTP });
  assert.equal(mehr.kind, 'otp');
  assert.equal(mehr.amount, 0);

  const coded = parseBankSms({
    sender: 'B.MELLAT',
    body: 'کد تایید شما: 123456 مبلغ 500,000 ریال',
  });
  assert.equal(coded.kind, 'otp');
});

test('blu bank expense detects amount, roundup and balance in toman', () => {
  const parsed = parseBankSms({
    sender: '09999987641',
    body: BLU_EXPENSE,
    receivedAt: new Date(2026, 10, 12, 16, 45),
  });

  assert.equal(parsed.kind, 'transaction');
  assert.equal(parsed.bank?.code, 'blu');
  assert.equal(parsed.type, 'expense');
  assert.equal(parsed.amount, 161_150);
  assert.equal(parsed.roundup, 8_850);
  assert.equal(parsed.balance, 352_997);
  assert.equal(parsed.shamsi, '1405/08/21');
});

test('blu bank income detects both pool and plain deposits', () => {
  const pool = parseBankSms({ sender: '09999987641', body: BLU_INCOME_POOL });
  assert.equal(pool.type, 'income');
  assert.equal(pool.amount, 53_000);
  assert.equal(pool.balance, 405_997);

  const deposit = parseBankSms({ sender: 'Blu', body: BLU_INCOME_DEPOSIT });
  assert.equal(deposit.type, 'income');
  assert.equal(deposit.amount, 80_000);
  assert.equal(deposit.balance, 485_997);
});

test('pasargad parses left-side signs, date and balance', () => {
  const income = parseBankSms({ sender: 'B.Pasargad', body: PARSAGAD_INCOME });
  assert.equal(income.type, 'income');
  assert.equal(income.amount, 94_000);
  assert.equal(income.balance, 4_659_641);
  assert.equal(income.time, '10:02');

  const expense = parseBankSms({ sender: 'B.Pasargad', body: PARSAGAD_EXPENSE });
  assert.equal(expense.type, 'expense');
  assert.equal(expense.amount, 481_100);
  assert.equal(expense.balance, 11_656);
  assert.equal(expense.shamsi, '1405/08/20');
  assert.equal(expense.dateIso, '2026-11-11T21:53:00');
});

test('mehr iran parses right-side signs and jalali datetime', () => {
  const income = parseBankSms({ sender: 'B.QMEHRIRAN', body: MEHR_INCOME });
  assert.equal(income.type, 'income');
  assert.equal(income.amount, 480_000);
  assert.equal(income.balance, 10_081_209);
  assert.equal(income.shamsi, '1405/08/20');
  assert.equal(income.time, '21:53');

  const expense = parseBankSms({ sender: 'B.QMEHRIRAN', body: MEHR_EXPENSE });
  assert.equal(expense.type, 'expense');
  assert.equal(expense.amount, 501_100);
  assert.equal(expense.shamsi, '1405/08/21');
});

test('self transfer between pasargad and mehr is linked with fee', () => {
  const expense = parseBankSms({ sender: 'B.Pasargad', body: PARSAGAD_EXPENSE });
  const income = parseBankSms({ sender: 'B.QMEHRIRAN', body: MEHR_INCOME });

  const links = detectSelfTransfers([
    {
      id: 1,
      bankAccountId: 1,
      type: 'expense',
      amount: expense.amount,
      dateIso: expense.dateIso!,
    },
    {
      id: 2,
      bankAccountId: 2,
      type: 'income',
      amount: income.amount,
      dateIso: income.dateIso!,
    },
  ]);

  assert.equal(links.length, 1);
  assert.equal(links[0].expenseId, 1);
  assert.equal(links[0].incomeId, 2);
  assert.equal(links[0].fee, 1_100);

  // همان دو تراکنش با فاصله‌ی زیاد نباید جفت شوند
  const far = detectSelfTransfers([
    { id: 1, bankAccountId: 1, type: 'expense', amount: 481_100, dateIso: '2026-11-11T21:53:00' },
    { id: 2, bankAccountId: 2, type: 'income', amount: 480_000, dateIso: '2026-11-11T23:30:00' },
  ]);
  assert.equal(far.length, 0);

  // تراکنش داخلی یک حساب، انتقال نیست
  const sameAccount = detectSelfTransfers([
    { id: 1, bankAccountId: 1, type: 'expense', amount: 481_100, dateIso: '2026-11-11T21:53:00' },
    { id: 2, bankAccountId: 1, type: 'income', amount: 480_000, dateIso: '2026-11-11T21:53:00' },
  ]);
  assert.equal(sameAccount.length, 0);
});

test('detectSelfTransfers picks the closest income in time when fees are equal', () => {
  const links = detectSelfTransfers([
    { id: 1, bankAccountId: 1, type: 'expense', amount: 500_000, dateIso: '2026-11-11T12:05:00' },
    // واریز از ۸ دقیقه پیش
    { id: 2, bankAccountId: 2, type: 'income', amount: 500_000, dateIso: '2026-11-11T11:57:00' },
    // واریز از ۳۰ ثانیه بعد (بسیار نزدیک‌تر)
    { id: 3, bankAccountId: 2, type: 'income', amount: 500_000, dateIso: '2026-11-11T12:05:30' },
  ]);

  assert.equal(links.length, 1);
  assert.equal(links[0].expenseId, 1);
  assert.equal(links[0].incomeId, 3, 'باید واریز نزدیک‌تر به زمان برداشت انتخاب شود');
  assert.equal(links[0].fee, 0);
});

test('buildDate derives year from receivedAt when sms omits the year', () => {
  // پیامک پاسارگاد بدون سال، با تاریخ دریافت ۲ سال قبل (۱۴۰۳)
  const receivedPast = new Date(2024, 7, 20, 14, 30, 0); // حدود مرداد ۱۴۰۳
  const parsed = parseBankSms({
    sender: 'Bank Pasargad',
    body: 'برداشت 500000 ریال\nاز 1234\n05/30-14:30\nمانده: 1000000',
    receivedAt: receivedPast,
  });
  assert.equal(parsed.kind, 'transaction');
  assert.ok(parsed.shamsi?.startsWith('1403/'), `سال شمسی باید ۱۴۰۳ باشد ولی شد ${parsed.shamsi}`);
});

test('generic bank message falls back to keywords', () => {
  const deposit = parseBankSms({
    sender: 'B.SAMAN',
    body: 'واریز به حساب\nمبلغ: 2,500,000 ریال\nمانده: 10,000,000',
  });
  assert.equal(deposit.kind, 'transaction');
  assert.equal(deposit.type, 'income');
  assert.equal(deposit.amount, 250_000);

  const purchase = parseBankSms({
    sender: 'B.SAMAN',
    body: 'خرید از فروشگاه\nمبلغ: 1,200,000 ریال',
  });
  assert.equal(purchase.type, 'expense');
  assert.equal(purchase.amount, 120_000);

  const noise = parseBankSms({ sender: 'B.SAMAN', body: 'به روزرسانی اپلیکیشن انجام شد' });
  assert.equal(noise.kind, 'unknown');
});

test('rial to toman keeps amounts exact', () => {
  assert.equal(rialToToman(1_611_500), 161_150);
  assert.equal(rialToToman(88_500), 8_850);
  assert.equal(rialToToman(4_800_000), 480_000);
});

test('a toman-denominated sms is not divided by ten', () => {
  const parsed = parseBankSms({
    sender: 'B.SAMAN',
    body: 'خرید از فروشگاه\nمبلغ: 120,000 تومان\nمانده: 1,200,000 تومان',
  });

  assert.equal(parsed.kind, 'transaction');
  assert.equal(parsed.type, 'expense');
  assert.equal(parsed.amount, 120_000, 'مبلغ تومانی نباید بر ۱۰ تقسیم شود');
  assert.equal(parsed.balance, 1_200_000, 'مانده تومانی نباید بر ۱۰ تقسیم شود');
});

test('mixed units are read from the unit next to each number', () => {
  const parsed = parseBankSms({
    sender: 'B.SAMAN',
    body: 'واریز به حساب\nمبلغ: 500,000 ریال\nمانده: 1,200,000 تومان',
  });

  assert.equal(parsed.type, 'income');
  assert.equal(parsed.amount, 50_000, 'مبلغ ریالی باید بر ۱۰ تقسیم شود');
  assert.equal(parsed.balance, 1_200_000, 'مانده تومانی باید دست‌نخورده بماند');
});

test('a pasargad-style line with an explicit toman unit stays in toman', () => {
  const parsed = parseBankSms({
    sender: 'B.Pasargad',
    body: '-4,811,000 تومان\n08/20 21:53\nمانده: 116,556 تومان',
  });

  assert.equal(parsed.type, 'expense');
  assert.equal(parsed.amount, 4_811_000);
  assert.equal(parsed.balance, 116_556);
});

test('bank sms without any unit keeps the rial default', () => {
  const parsed = parseBankSms({ sender: 'B.Pasargad', body: PARSAGAD_EXPENSE });
  assert.equal(parsed.amount, 481_100);
  assert.equal(parsed.balance, 11_656);
});

test('sms unit helpers answer consistently', () => {
  assert.equal(detectSmsUnit('1,000 ریال'), 'rial');
  assert.equal(detectSmsUnit('1,000 تومان'), 'toman');
  assert.equal(detectSmsUnit('1,000 ریال و 2,000 تومان'), null);
  assert.equal(detectSmsUnit('1,000'), null);

  assert.equal(smsValueToToman(1_000, 'rial', null), 100);
  assert.equal(smsValueToToman(1_000, 'toman', null), 1_000);
  assert.equal(smsValueToToman(1_000, null, 'toman'), 1_000);
  assert.equal(smsValueToToman(1_000, null, null), 100);
});

test('sms id is stable and unique per message', () => {
  const first = createSmsId('B.Pasargad', PARSAGAD_INCOME, '2026-11-11T10:02:00');
  const second = createSmsId('B.Pasargad', PARSAGAD_INCOME, '2026-11-11T10:02:00');
  const other = createSmsId('B.Pasargad', PARSAGAD_EXPENSE, '2026-11-11T21:53:00');

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.ok(first.startsWith('sms_'));
});
