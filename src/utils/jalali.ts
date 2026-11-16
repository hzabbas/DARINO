import { jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';

import { toPersianDigits } from './digits';

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

/** Weekday names matching Date.getDay(): 0 Sunday, 6 Saturday. */
export const JALALI_WEEKDAYS = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
  'شنبه',
] as const;

export interface JalaliParts {
  jy: number;
  jm: number;
  jd: number;
}

export interface JalaliMonthRange {
  jy: number;
  jm: number;
  label: string;
  /** Month start in local ISO, inclusive. */
  startIso: string;
  /** Next month start in local ISO, exclusive. */
  endIso: string;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * Format local date as YYYY-MM-DD.
 */
export function formatLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Date only regex pattern (YYYY-MM-DD). */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse input into local Date instance.
 */
export function parseLocalDate(input: Date | string | number): Date | null {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === 'number') {
    const fromNumber = new Date(input);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }

  const raw = String(input ?? '').trim();
  const dateOnly = DATE_ONLY_PATTERN.exec(raw);
  if (dateOnly) {
    const date = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      0,
      0,
      0,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Convert Gregorian date to local ISO format without timezone shift.
 */
export function toLocalIso(date: Date): string {
  return (
    `${formatLocalISODate(date)}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  );
}

/** Format short Shamsi date: YYYY/MM/DD */
export function formatShamsiShort(input: Date | string | number): string {
  const date = parseLocalDate(input);
  if (!date) return '—';
  const { jy, jm, jd } = toJalaali(date);
  return toPersianDigits(`${jy}/${pad2(jm)}/${pad2(jd)}`);
}

/** Format long Jalali date with optional weekday and year. */
export function formatJalaliDate(
  input: Date | string | number,
  options: { withWeekday?: boolean; withYear?: boolean } = {},
): string {
  const date = parseLocalDate(input);
  if (!date) return '—';

  const { jy, jm, jd } = toJalaali(date);
  const parts = [toPersianDigits(jd), JALALI_MONTHS[jm - 1]];
  if (options.withYear !== false) {
    parts.push(toPersianDigits(jy));
  }

  const label = parts.join(' ');
  if (options.withWeekday) {
    return `${JALALI_WEEKDAYS[date.getDay()]}، ${label}`;
  }
  return label;
}

/** Format month and year: e.g. Aban 1405 */
export function formatJalaliMonthYear(input: Date | string | number): string {
  const date = parseLocalDate(input);
  if (!date) return '—';
  const { jy, jm } = toJalaali(date);
  return `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}

/** Format time in HH:mm. */
export function formatTime(input: Date | string | number): string {
  const date = parseLocalDate(input);
  if (!date) return '—';
  return toPersianDigits(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`);
}

export function getJalaliParts(input: Date | string | number = new Date()): JalaliParts {
  const date = parseLocalDate(input);
  if (!date) {
    throw new Error('تاریخ نامعتبر است');
  }
  return toJalaali(date);
}

/** Get Jalali month date range with local ISO strings. */
export function getJalaliMonthRange(
  yearOrDate: number | Date | string = new Date(),
  month?: number,
): JalaliMonthRange {
  const jy = typeof yearOrDate === 'number' ? yearOrDate : getJalaliParts(yearOrDate).jy;
  const jm = typeof yearOrDate === 'number' ? (month ?? 1) : getJalaliParts(yearOrDate).jm;

  const length = jalaaliMonthLength(jy, jm);
  const start = toGregorian(jy, jm, 1);
  const next = toGregorian(jy, jm, length);

  const startDate = new Date(start.gy, start.gm - 1, start.gd, 0, 0, 0);
  const endDate = new Date(next.gy, next.gm - 1, next.gd + 1, 0, 0, 0);

  return {
    jy,
    jm,
    label: `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`,
    startIso: toLocalIso(startDate),
    endIso: toLocalIso(endDate),
  };
}

/** Format today header label with weekday name. */
export function formatTodayLabel(now: Date = new Date()): string {
  return formatJalaliDate(now, { withWeekday: true });
}

/**
 * Calendar month grid.
 * Weeks start on Saturday (index 0). Empty cells filled with null.
 */
export function buildJalaliMonthGrid(jy: number, jm: number): (number | null)[][] {
  const monthLength = jalaaliMonthLength(jy, jm);
  const first = toGregorian(jy, jm, 1);
  const firstDate = new Date(first.gy, first.gm - 1, first.gd);
  const leadingBlanks = (firstDate.getDay() + 1) % 7; // Saturday = 0

  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: monthLength }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (number | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/** Convert Jalali day components to Gregorian Date object. */
export function jalaliDayToDate(
  jy: number,
  jm: number,
  jd: number,
  timeSource: Date = new Date(),
): Date {
  const gregorian = toGregorian(jy, jm, jd);
  return new Date(
    gregorian.gy,
    gregorian.gm - 1,
    gregorian.gd,
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
  );
}
