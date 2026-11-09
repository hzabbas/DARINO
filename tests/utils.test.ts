import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAmount, formatShortAmount, formatSignedAmount, formatToman, groupThousands, parseAmount } from '../src/utils/currency';
import { onlyDigits, toLatinDigits, toPersianDigits } from '../src/utils/digits';
import {
  formatJalaliDate,
  formatJalaliMonthYear,
  formatShamsiShort,
  getJalaliMonthRange,
  toLocalIso,
} from '../src/utils/jalali';
import { getRangeBounds, getRangeCaption } from '../src/utils/ranges';

test('persian digits conversion', () => {
  assert.equal(toPersianDigits(1250000), '۱۲۵۰۰۰۰');
  assert.equal(toPersianDigits('2026/11/09'), '۲۰۲۶/۱۱/۰۹');
  assert.equal(toLatinDigits('۱۲۳۴۵۶۷۸۹۰'), '1234567890');
  assert.equal(toLatinDigits('٤٥٦'), '456');
  assert.equal(onlyDigits('۱,۲۵۰,۰۰۰ تومان'), '1250000');
  assert.equal(onlyDigits('abc'), '');
});

test('thousands grouping with persian digits', () => {
  assert.equal(groupThousands(1250000), '1,250,000');
  assert.equal(groupThousands(0), '0');
  assert.equal(groupThousands(999), '999');
  assert.equal(groupThousands(1000), '1,000');
  assert.equal(groupThousands(1234567890), '1,234,567,890');
  assert.equal(groupThousands(-4500), '-4,500');

  assert.equal(formatAmount(1250000), '۱,۲۵۰,۰۰۰');
  assert.equal(formatToman(1250000), '۱,۲۵۰,۰۰۰ تومان');
  assert.equal(formatToman(0), '۰ تومان');
});

test('amount parsing accepts typed input', () => {
  assert.equal(parseAmount('۱,۲۵۰,۰۰۰'), 1250000);
  assert.equal(parseAmount('1250000'), 1250000);
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount('  ۱۲۳ '), 123);
  assert.equal(parseAmount(2500), 2500);
});

test('signed amounts show profit or loss', () => {
  assert.equal(formatSignedAmount(1250000), '+۱,۲۵۰,۰۰۰');
  assert.equal(formatSignedAmount(-4500), '−۴,۵۰۰');
  assert.equal(formatSignedAmount(0), '۰');
});

test('short amount formatting for cards', () => {
  assert.equal(formatShortAmount(12500000), '۱۲٫۵ میلیون');
  assert.equal(formatShortAmount(1500000000), '۱٫۵ میلیارد');
  assert.equal(formatShortAmount(45000), '۴۵,۰۰۰');
});

test('gregorian to jalaali conversion', () => {
  const date = new Date(2026, 10, 9, 14, 30, 0); // 9 Nov 2026

  assert.equal(formatShamsiShort(date), '۱۴۰۵/۰۸/۱۸');
  assert.equal(formatJalaliDate(date), '۱۸ آبان ۱۴۰۵');
  assert.equal(formatJalaliDate(date, { withWeekday: true }), 'دوشنبه، ۱۸ آبان ۱۴۰۵');
  assert.equal(formatJalaliMonthYear(date), 'آبان ۱۴۰۵');
  assert.equal(formatShamsiShort('2026-11-09T14:30:00'), '۱۴۰۵/۰۸/۱۸');
  assert.equal(formatJalaliDate('not-a-date'), '—');
});

test('local iso keeps the local day (no UTC shift)', () => {
  const date = new Date(2026, 10, 9, 8, 5, 3);
  assert.equal(toLocalIso(date), '2026-11-09T08:05:03');
});

test('jalaali month range is exclusive at the end', () => {
  const range = getJalaliMonthRange(new Date(2026, 10, 9));

  assert.equal(range.jy, 1405);
  assert.equal(range.jm, 8);
  assert.equal(range.label, 'آبان ۱۴۰۵');
  assert.equal(range.startIso, '2026-10-23T00:00:00');
  assert.equal(range.endIso, '2026-11-22T00:00:00');

  const direct = getJalaliMonthRange(1405, 8);
  assert.equal(direct.startIso, range.startIso);
  assert.equal(direct.endIso, range.endIso);
});

test('esfand length is respected in the range', () => {
  const leapYear = getJalaliMonthRange(1403, 12); // 1403 is a leap year
  assert.equal(leapYear.startIso, '2025-02-19T00:00:00');
  assert.equal(leapYear.endIso, '2025-03-21T00:00:00');

  const commonYear = getJalaliMonthRange(1404, 12);
  assert.equal(commonYear.startIso, '2026-02-20T00:00:00');
  assert.equal(commonYear.endIso, '2026-03-21T00:00:00');
});

test('dashboard range bounds start on saturday and cover today', () => {
  const monday = new Date(2026, 10, 9, 15, 30); // دوشنبه ۱۸ آبان ۱۴۰۵

  assert.deepEqual(getRangeBounds('today', monday), {
    startIso: '2026-11-09T00:00:00',
    endIso: '2026-11-10T00:00:00',
  });
  assert.deepEqual(getRangeBounds('week', monday), {
    startIso: '2026-11-07T00:00:00',
    endIso: '2026-11-14T00:00:00',
  });
  assert.deepEqual(getRangeBounds('month', monday), {
    startIso: '2026-10-23T00:00:00',
    endIso: '2026-11-22T00:00:00',
  });
  assert.equal(getRangeBounds('all', monday), null);

  // خود شنبه هم باید شروع هفته باشد
  const saturday = new Date(2026, 10, 7, 9, 0);
  assert.equal(getRangeBounds('week', saturday)?.startIso, '2026-11-07T00:00:00');

  // جمعه آخرین روز هفته است
  const friday = new Date(2026, 10, 13, 9, 0);
  assert.equal(getRangeBounds('week', friday)?.startIso, '2026-11-07T00:00:00');
  assert.equal(getRangeBounds('week', friday)?.endIso, '2026-11-14T00:00:00');
});

test('dashboard range captions', () => {
  const monday = new Date(2026, 10, 9);

  assert.equal(getRangeCaption('today', monday), 'دوشنبه، ۱۸ آبان ۱۴۰۵');
  assert.equal(getRangeCaption('week', monday), '۱۶ تا ۲۲ آبان');
  assert.equal(getRangeCaption('month', monday), 'آبان ۱۴۰۵');
  assert.equal(getRangeCaption('all', monday), 'از ابتدا تا امروز');

  // هفته‌ای که از آبان به آذر می‌رسد
  const crossesMonth = new Date(2026, 10, 21);
  assert.equal(getRangeCaption('week', crossesMonth), '۳۰ آبان تا ۶ آذر');
});
