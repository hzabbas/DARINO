import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAmount, formatShortAmount, formatSignedAmount, formatToman, groupThousands, parseAmount } from '../src/utils/currency';
import { onlyDigits, toLatinDigits, toPersianDigits } from '../src/utils/digits';
import {
  formatJalaliDate,
  formatJalaliMonthYear,
  formatLocalISODate,
  formatShamsiShort,
  getJalaliMonthRange,
  toLocalIso,
} from '../src/utils/jalali';
import { getRangeBounds, getRangeCaption } from '../src/utils/ranges';
import { buildJalaliMonthGrid, jalaliDayToDate } from '../src/utils/jalaliCalendar';
import { formatAmountInWords, numberToPersianWords } from '../src/utils/numberToWords';

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

test('amounts are written out in persian words', () => {
  assert.equal(numberToPersianWords(0), 'صفر');
  assert.equal(numberToPersianWords(1), 'یک');
  assert.equal(numberToPersianWords(17), 'هفده');
  assert.equal(numberToPersianWords(40), 'چهل');
  assert.equal(numberToPersianWords(101), 'یکصد و یک');
  assert.equal(numberToPersianWords(999), 'نهصد و نود و نه');
  assert.equal(numberToPersianWords(1000), 'هزار');
  assert.equal(numberToPersianWords(100000), 'یکصد هزار');
  assert.equal(numberToPersianWords(350000), 'سیصد و پنجاه هزار');
  assert.equal(numberToPersianWords(1000000), 'یک میلیون');
  assert.equal(numberToPersianWords(1001000), 'یک میلیون و هزار');
  assert.equal(
    numberToPersianWords(123456789),
    'یکصد و بیست و سه میلیون و چهارصد و پنجاه و شش هزار و هفتصد و هشتاد و نه',
  );
  assert.equal(numberToPersianWords(2000000000), 'دو میلیارد');
});

test('amount words are shown in toman', () => {
  assert.equal(formatAmountInWords(350000), 'سیصد و پنجاه هزار تومان');
  assert.equal(formatAmountInWords(0), 'صفر تومان');
  assert.equal(formatAmountInWords(-2500), 'دو هزار و پانصد تومان');
});

test('jalaali calendar grid starts on saturday', () => {
  // آبان ۱۴۰۵ سی روز دارد و از جمعه شروع می‌شود
  const weeks = buildJalaliMonthGrid(1405, 8);
  assert.equal(weeks.length, 6);
  for (const week of weeks) {
    assert.equal(week.length, 7);
  }
  assert.deepEqual(weeks[0], [null, null, null, null, null, null, 1]);

  const days = weeks.flat().filter((day): day is number => day !== null);
  assert.equal(days.length, 30);
  assert.equal(days[0], 1);
  assert.equal(days[29], 30);

  // اسفند ۱۴۰۳ سال کبیسه است
  const leapDays = buildJalaliMonthGrid(1403, 12)
    .flat()
    .filter((day): day is number => day !== null);
  assert.equal(leapDays.length, 30);
});

test('a picked jalaali day maps to the right gregorian date', () => {
  const source = new Date(2026, 10, 9, 14, 30, 0);
  const picked = jalaliDayToDate(1405, 8, 18, source);

  assert.equal(picked.getFullYear(), 2026);
  assert.equal(picked.getMonth(), 10);
  assert.equal(picked.getDate(), 9);
  assert.equal(picked.getHours(), 14);
  assert.equal(picked.getMinutes(), 30);
});

test('local date helpers never shift across midnight (iran is utc+3:30)', () => {
  // ساعت ۰۰:۱۵ بامداد به وقت محلی؛ toISOString().slice(0, 10) اینجا روز قبل را می‌داد
  const afterMidnight = new Date(2026, 10, 9, 0, 15, 0);
  assert.equal(formatLocalISODate(afterMidnight), '2026-11-09');
  assert.equal(toLocalIso(afterMidnight), '2026-11-09T00:15:00');
  assert.equal(formatShamsiShort(afterMidnight), '۱۴۰۵/۰۸/۱۸');
  assert.deepEqual(getRangeBounds('today', afterMidnight), {
    startIso: '2026-11-09T00:00:00',
    endIso: '2026-11-10T00:00:00',
  });

  // دقیقه‌ی آخر روز
  const beforeMidnight = new Date(2026, 10, 9, 23, 59, 59);
  assert.equal(formatLocalISODate(beforeMidnight), '2026-11-09');
  assert.equal(formatShamsiShort(beforeMidnight), '۱۴۰۵/۰۸/۱۸');

  // اول ژانویه، نیمه‌شب (سال نو میلادی)
  assert.equal(formatLocalISODate(new Date(2026, 0, 1, 0, 0, 0)), '2026-01-01');
  assert.equal(formatLocalISODate(new Date(2026, 0, 1, 23, 59, 0)), '2026-01-01');
});

test('week runs from saturday to friday for every weekday', () => {
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(2026, 10, 7 + offset, 12, 0, 0); // شنبه ۱۶ آبان تا جمعه ۲۲ آبان
    assert.deepEqual(
      getRangeBounds('week', day),
      { startIso: '2026-11-07T00:00:00', endIso: '2026-11-14T00:00:00' },
      `offset ${offset}`,
    );
  }

  // شنبه‌ی اول فروردین، هفته‌ی درست را می‌سازد
  const nowruzWeek = getRangeBounds('week', new Date(2026, 2, 21, 10, 0, 0));
  assert.equal(nowruzWeek?.startIso, '2026-03-21T00:00:00');
  assert.equal(nowruzWeek?.endIso, '2026-03-28T00:00:00');
});

test('jalaali month lengths follow 31/30/29 rules', () => {
  const lengths = Array.from({ length: 12 }, (_, index) => {
    const { startIso, endIso } = getJalaliMonthRange(1403, index + 1);
    const days = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 86_400_000;
    return Math.round(days);
  });

  assert.deepEqual(lengths, [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30]);

  // اسفند: ۳۰ روز در سال کبیسه، ۲۹ روز در سال عادی
  const monthLength = (jy: number, jm: number) => {
    const { startIso, endIso } = getJalaliMonthRange(jy, jm);
    return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 86_400_000);
  };
  assert.equal(monthLength(1403, 12), 30);
  assert.equal(monthLength(1404, 12), 29);
  assert.equal(monthLength(1405, 12), 29);
});

test('arabic and persian digits are normalized before parsing', () => {
  assert.equal(parseAmount('٣٥٠٬٠٠٠'), 350000);
  assert.equal(parseAmount('۳۵۰،۰۰۰'), 350000);
  assert.equal(parseAmount('٠'), 0);
  assert.equal(onlyDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(onlyDigits('۱۲۳٤٥٦'), '123456');
});

test('large amounts stay exact without float drift', () => {
  const value = parseAmount('۹۹۹,۹۹۹,۹۹۹,۹۹۹');
  assert.equal(value, 999_999_999_999);
  assert.ok(Number.isSafeInteger(value));
  assert.equal(groupThousands(value), '999,999,999,999');
  assert.equal(parseAmount('۱۲۳۴۵۶۷۸۹۰۱۲'), 123_456_789_012);
});
