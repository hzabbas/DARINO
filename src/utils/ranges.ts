import { toJalaali } from 'jalaali-js';

import type { DateRange } from '../types/models';
import { toPersianDigits } from './digits';
import { JALALI_MONTHS, formatJalaliDate, getJalaliMonthRange, parseLocalDate, toLocalIso } from './jalali';

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
 * Dashboard date range bounds.
 * Week starts on Saturday; month follows Jalali calendar.
 */
export function getRangeBounds(range: DashboardRange, now: Date = new Date()): DateRange | null {
  switch (range) {
    case 'today': {
      const start = startOfDay(now);
      return { startIso: toLocalIso(start), endIso: toLocalIso(addDays(start, 1)) };
    }
    case 'week': {
      const daysSinceSaturday = (now.getDay() + 1) % 7; // Saturday = 0
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

/** Short range caption for hero subtitle. */
export function getRangeCaption(range: DashboardRange, now: Date = new Date()): string {
  switch (range) {
    case 'today':
      return formatJalaliDate(now, { withWeekday: true });
    case 'week': {
      const bounds = getRangeBounds('week', now);
      if (!bounds) return '';
      // Parse in local time to avoid timezone shifts.
      const start = parseLocalDate(bounds.startIso);
      const end = parseLocalDate(bounds.endIso);
      if (!start || !end) return '';
      end.setDate(end.getDate() - 1); // Last day of week

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

// Report ranges

export type ReportRangeKind = 'today' | 'week' | 'month';
export type ReportRangeTab = ReportRangeKind | 'custom';

export type ReportRange =
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'custom-month'; jy: number; jm: number };

export const REPORT_RANGES: { value: ReportRangeKind; label: string }[] = [
  { value: 'today', label: 'امروز' },
  { value: 'week', label: 'این هفته' },
  { value: 'month', label: 'این ماه' },
];

/** Report date bounds (supports custom Jalali months). */
export function getReportBounds(range: ReportRange, now: Date = new Date()): DateRange {
  if (range.kind === 'custom-month') {
    const month = getJalaliMonthRange(range.jy, range.jm);
    return { startIso: month.startIso, endIso: month.endIso };
  }

  const bounds = getRangeBounds(range.kind, now);
  if (!bounds) {
    throw new Error('بازه‌ی نامعتبر');
  }
  return bounds;
}

/** Detailed range caption. */
export function getReportCaption(range: ReportRange, now: Date = new Date()): string {
  if (range.kind === 'custom-month') {
    return `${JALALI_MONTHS[range.jm - 1]} ${toPersianDigits(range.jy)}`;
  }
  return getRangeCaption(range.kind, now);
}

/** Jalali month label for chips. */
export function formatJalaliMonthLabel(jy: number, jm: number): string {
  return `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}
