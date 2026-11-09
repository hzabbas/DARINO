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

/** ایندکس با خروجی Date.getDay() هم‌خوان است: ۰ یکشنبه، ۶ شنبه */
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
  /** ابتدای ماه به وقت محلی، شامل */
  startIso: string;
  /** ابتدای ماه بعد به وقت محلی، غیرشامل */
  endIso: string;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

function parseDate(input: Date | string | number): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * تاریخ میلادی را به ISO محلی (بدون Z) تبدیل می‌کند.
 * عمداً از toISOString استفاده نمی‌کنیم تا روز شمسی با روز میلادی محلی هم‌تراز بماند.
 */
export function toLocalIso(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  );
}

/** "۲۰۲۶-۱۱-۰۹T۱۴:۳۰:۰۰" → ۱۴۰۵/۰۸/۱۸ */
export function formatShamsiShort(input: Date | string | number): string {
  const date = parseDate(input);
  if (!date) return '—';
  const { jy, jm, jd } = toJalaali(date);
  return toPersianDigits(`${jy}/${pad2(jm)}/${pad2(jd)}`);
}

/** ۱۸ آبان ۱۴۰۵ */
export function formatJalaliDate(
  input: Date | string | number,
  options: { withWeekday?: boolean; withYear?: boolean } = {},
): string {
  const date = parseDate(input);
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

/** آبان ۱۴۰۵ */
export function formatJalaliMonthYear(input: Date | string | number): string {
  const date = parseDate(input);
  if (!date) return '—';
  const { jy, jm } = toJalaali(date);
  return `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}

/** ۱۴:۳۰ */
export function formatTime(input: Date | string | number): string {
  const date = parseDate(input);
  if (!date) return '—';
  return toPersianDigits(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`);
}

export function getJalaliParts(input: Date | string | number = new Date()): JalaliParts {
  const date = parseDate(input);
  if (!date) {
    throw new Error('تاریخ نامعتبر است');
  }
  return toJalaali(date);
}

/** بازه‌ی یک ماه شمسی را برای فیلتر queries برمی‌گرداند (پایان غیرشامل). */
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

/** برچسب امروز برای سربرگ داشبورد: شنبه، ۱۸ آبان ۱۴۰۵ */
export function formatTodayLabel(now: Date = new Date()): string {
  return formatJalaliDate(now, { withWeekday: true });
}
