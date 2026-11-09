import type { DateRange } from '../types/models';
import { toPersianDigits } from './digits';
import { JALALI_MONTHS, getJalaliMonthRange } from './jalali';
import { getRangeBounds, getRangeCaption } from './ranges';

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

/** مرزهای بازه‌ی گزارش (ماه شمسی دلخواه هم پشتیبانی می‌شود). */
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

/** توضیح دقیق بازه، مثل «آبان ۱۴۰۵» یا «۱۶ تا ۲۲ آبان». */
export function getReportCaption(range: ReportRange, now: Date = new Date()): string {
  if (range.kind === 'custom-month') {
    return `${JALALI_MONTHS[range.jm - 1]} ${toPersianDigits(range.jy)}`;
  }
  return getRangeCaption(range.kind, now);
}

/** برچسب کوتاه بازه برای چیپ انتخاب ماه. */
export function formatJalaliMonthLabel(jy: number, jm: number): string {
  return `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}
