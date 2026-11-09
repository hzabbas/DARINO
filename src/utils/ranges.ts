import { toJalaali } from 'jalaali-js';

import type { DateRange } from '../types/models';
import { toPersianDigits } from './digits';
import { JALALI_MONTHS, formatJalaliDate, getJalaliMonthRange, toLocalIso } from './jalali';

export type DashboardRange = 'today' | 'week' | 'month' | 'all';

export const DASHBOARD_RANGES: { value: DashboardRange; label: string }[] = [
  { value: 'today', label: 'امروز' },
  { value: 'week', label: 'این هفته' },
  { value: 'month', label: 'این ماه' },
  { value: 'all', label: 'کل زمان‌ها' },
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * مرزهای بازه‌ی انتخابی داشبورد.
 * هفته از شنبه (اول هفته در ایران) شروع می‌شود، ماه از اول ماه شمسی
 * و «کل زمان‌ها» فیلتری ندارد.
 */
export function getRangeBounds(range: DashboardRange, now: Date = new Date()): DateRange | null {
  switch (range) {
    case 'today': {
      const start = startOfDay(now);
      return { startIso: toLocalIso(start), endIso: toLocalIso(addDays(start, 1)) };
    }
    case 'week': {
      const daysSinceSaturday = (now.getDay() + 1) % 7; // شنبه = ۰
      const start = addDays(startOfDay(now), -daysSinceSaturday);
      return { startIso: toLocalIso(start), endIso: toLocalIso(addDays(start, 7)) };
    }
    case 'month': {
      const month = getJalaliMonthRange(now);
      return { startIso: month.startIso, endIso: month.endIso };
    }
    case 'all':
    default:
      return null;
  }
}

/** توضیح کوتاه بازه برای زیرعنوان کارت وضعیت مالی. */
export function getRangeCaption(range: DashboardRange, now: Date = new Date()): string {
  switch (range) {
    case 'today':
      return formatJalaliDate(now, { withWeekday: true });
    case 'week': {
      const bounds = getRangeBounds('week', now);
      if (!bounds) return '';
      const start = new Date(bounds.startIso);
      const end = new Date(bounds.endIso);
      end.setDate(end.getDate() - 1); // آخرین روز هفته

      const startJalali = toJalaali(start);
      const endJalali = toJalaali(end);
      const startDay = toPersianDigits(startJalali.jd);
      const endDay = toPersianDigits(endJalali.jd);

      if (startJalali.jm === endJalali.jm) {
        return `${startDay} تا ${endDay} ${JALALI_MONTHS[startJalali.jm - 1]}`;
      }
      return `${startDay} ${JALALI_MONTHS[startJalali.jm - 1]} تا ${endDay} ${
        JALALI_MONTHS[endJalali.jm - 1]
      }`;
    }
    case 'month':
      return getJalaliMonthRange(now).label;
    case 'all':
    default:
      return 'از ابتدا تا امروز';
  }
}
