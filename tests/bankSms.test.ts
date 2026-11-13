import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBankAccount,
  findAccountBySender,
  getBankAccount,
  listBankAccounts,
  totalBankBalance,
  updateBankAccount,
} from '../src/db/bankAccounts';
import { listCategories } from '../src/db/categories';
import { migrate } from '../src/db/migrate';
import {
  approvePendingSms,
  countPendingSms,
  ensureBankFeeCategory,
  listPendingSms,
} from '../src/db/pendingSms';
import { listTransactions } from '../src/db/transactions';
import { ingestBankSms, pairPendingTransfers } from '../src/features/smsIngest';
import type { SqlDatabase } from '../src/types/models';
import { createNodeDatabase } from './helpers/nodeDatabase';

const BLU_EXPENSE =
  'بلو\nبرداشت زند\nعباس عزیز، 1,611,500 ریال از حساب شما پرید.\nو 88,500 ریال هم رند شد.\nموجودی: 3,529,970 ریال';
const BLU_OTP = 'فروش مستقیم بسته-از طریق نرم افزار موبایل\nمبلغ: 1,611,500 ریال\nرمز: 884144';
const PASARGAD_EXPENSE = '777.888.27923610.1\n-4,811,000\n08/20 21:53\nمانده: 116,556';
const MEHR_INCOME = '300379091710\n4,800,000+\n1405/8/20-21:53\nمانده:100,812,087';

function setup(): { db: SqlDatabase; bluId: number; pasargadId: number; mehrId: number } {
  const db = createNodeDatabase();
  migrate(db);

  const bluId = createBankAccount(db, {
    bank_code: 'blu',
    title: 'بلوبانک شخصی',
    senders: ['09999987641'],
    initial_balance: 5_000_000,
  });
  const pasargadId = createBankAccount(db, {
    bank_code: 'pasargad',
    title: 'پاسارگاد اصلی',
    senders: ['B.Pasargad'],
    initial_balance: 10_000_000,
  });
  const mehrId = createBankAccount(db, {
    bank_code: 'mehr',
    title: 'مهر ایران',
    senders: ['B.QMEHRIRAN'],
    initial_balance: 0,
  });

  return { db, bluId, pasargadId, mehrId };
}

test('bank accounts store senders, initial balance and totals', () => {
  const { db } = setup();
  const accounts = listBankAccounts(db);

  assert.equal(accounts.length, 3);
  assert.equal(accounts[0].senders[0], '09999987641');
  assert.equal(accounts[0].initial_balance, 5_000_000);
  assert.equal(accounts[0].current_balance, 5_000_000);
  assert.equal(totalBankBalance(db), 15_000_000);
  assert.equal(findAccountBySender(db, 'B.Pasargad')?.title, 'پاسارگاد اصلی');
  assert.equal(findAccountBySender(db, 'UNKNOWN'), null);
});

test('ingesting a blu expense queues it and syncs the balance', () => {
  const { db, bluId } = setup();

  const result = ingestBankSms(db, { sender: '09999987641', body: BLU_EXPENSE });

  assert.equal(result.status, 'queued');
  assert.equal(result.account?.id, bluId);
  assert.equal(result.parsed.amount, 161_150);
  assert.equal(countPendingSms(db), 1);

  const pending = listPendingSms(db)[0];
  assert.equal(pending.detected_type, 'expense');
  assert.equal(pending.amount, 161_150);
  assert.equal(pending.roundup_amount, 8_850);
  assert.equal(pending.detected_balance, 352_997);

  // موجودی حساب از مانده‌ی پیامک هم‌تراز شده
  assert.equal(listBankAccounts(db)[0].current_balance, 352_997);
});

test('the same sms twice is a duplicate and otp is ignored', () => {
  const { db } = setup();

  ingestBankSms(db, { sender: '09999987641', body: BLU_EXPENSE });
  const duplicate = ingestBankSms(db, { sender: '09999987641', body: BLU_EXPENSE });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(countPendingSms(db), 1);

  const otp = ingestBankSms(db, { sender: '09999987641', body: BLU_OTP });
  assert.equal(otp.status, 'ignored-otp');
  assert.equal(countPendingSms(db), 1);

  const postal = ingestBankSms(db, { sender: 'IRAN POST', body: 'بسته شما ارسال شد' });
  assert.equal(postal.status, 'ignored-unknown');

  const unknownBank = ingestBankSms(db, {
    sender: 'B.UNKNOWNBANK',
    body: 'واریز به حساب\nمبلغ: 100,000 ریال',
  });
  assert.equal(unknownBank.status, 'unmatched-account');
});

test('approving an expense creates a transaction and clears the queue', () => {
  const { db } = setup();
  const category = listCategories(db, 'expense')[0];

  ingestBankSms(db, { sender: '09999987641', body: BLU_EXPENSE });
  const pending = listPendingSms(db)[0];

  const approved = approvePendingSms(db, { id: pending.id, categoryId: category.id });
  assert.equal(approved, true);
  assert.equal(countPendingSms(db), 0);

  const transactions = listTransactions(db, null);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].amount, 161_150);
  assert.equal(transactions[0].type, 'expense');
  assert.equal(transactions[0].category_id, category.id);

  // تایید دوباره کاری نمی‌کند
  assert.equal(approvePendingSms(db, { id: pending.id, categoryId: category.id }), false);
  assert.equal(listTransactions(db, null).length, 1);
});

test('two sms from different banks become a self transfer with fee', () => {
  const { db } = setup();

  ingestBankSms(db, {
    sender: 'B.Pasargad',
    body: PASARGAD_EXPENSE,
    receivedAt: new Date(2026, 10, 11, 21, 53),
  });
  const paired = ingestBankSms(db, {
    sender: 'B.QMEHRIRAN',
    body: MEHR_INCOME,
    receivedAt: new Date(2026, 10, 11, 21, 53),
  });

  assert.equal(paired.status, 'queued');
  assert.equal(pairPendingTransfers(db), 0, 'قبلاً در زمان ثبت جفت شده‌اند');

  const rows = listPendingSms(db);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.detected_type === 'transfer'));
  assert.equal(rows[0].transfer_pair_id, rows[1].transfer_pair_id);

  const expenseRow = rows.find((row) => row.fee_amount > 0);
  assert.ok(expenseRow);
  assert.equal(expenseRow?.fee_amount, 1_100);
});

test('approving a transfer records only the bank fee', () => {
  const { db } = setup();

  ingestBankSms(db, {
    sender: 'B.Pasargad',
    body: PASARGAD_EXPENSE,
    receivedAt: new Date(2026, 10, 11, 21, 53),
  });
  ingestBankSms(db, {
    sender: 'B.QMEHRIRAN',
    body: MEHR_INCOME,
    receivedAt: new Date(2026, 10, 11, 21, 53),
  });

  const rows = listPendingSms(db);
  const feeRow = rows.find((row) => row.fee_amount > 0);
  assert.ok(feeRow);

  approvePendingSms(db, { id: feeRow!.id });

  const transactions = listTransactions(db, null);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].amount, 1_100);
  assert.equal(transactions[0].type, 'expense');
  assert.equal(
    listCategories(db, 'expense').find((category) => category.id === transactions[0].category_id)?.name,
    'کارمزد بانکی',
  );
});

test('bank fee category is created once', () => {
  const { db } = setup();

  const first = ensureBankFeeCategory(db);
  const second = ensureBankFeeCategory(db);

  assert.equal(first, second);
  assert.equal(
    listCategories(db, 'expense').filter((category) => category.name === 'کارمزد بانکی').length,
    1,
  );
});

test('editing account details never touches the balance by accident', () => {
  const { db, bluId } = setup();

  // تغییر نام، شماره کارت و سرشماره‌ها: موجودی روز و اولیه باید دست‌نخورده بمانند
  updateBankAccount(db, bluId, {
    title: 'بلوبانک من',
    account_number: '6037-9975-1234-5678',
    senders: ['09999987641', '+989999987641'],
  });

  const edited = getBankAccount(db, bluId);
  assert.equal(edited?.title, 'بلوبانک من');
  assert.equal(edited?.account_number, '6037-9975-1234-5678');
  assert.deepEqual(edited?.senders, ['09999987641', '+989999987641']);
  assert.equal(edited?.current_balance, 5_000_000, 'موجودی فعلی نباید عوض شود');
  assert.equal(edited?.initial_balance, 5_000_000);
  assert.equal(totalBankBalance(db), 15_000_000);
});

test('saving an explicit balance updates the current balance only', () => {
  const { db, bluId } = setup();

  updateBankAccount(db, bluId, { current_balance: 7_250_000 });

  const edited = getBankAccount(db, bluId);
  assert.equal(edited?.current_balance, 7_250_000);
  assert.equal(edited?.initial_balance, 5_000_000, 'موجودی اولیه تاریخچه است و عوض نمی‌شود');
  assert.equal(totalBankBalance(db), 7_250_000 + 10_000_000);
});

test('senders saved with the country prefix still catch the account', () => {
  const { db, bluId } = setup();

  updateBankAccount(db, bluId, { senders: ['+989999987641'] });

  assert.equal(findAccountBySender(db, '09999987641')?.id, bluId);
  assert.equal(findAccountBySender(db, '00989999987641')?.id, bluId);
});
