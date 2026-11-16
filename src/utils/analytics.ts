import { toJalaali } from 'jalaali-js';

import type { DateRange, TransactionWithCategory } from '../types/models';
import { toPersianDigits } from './digits';
import { JALALI_MONTHS, JALALI_WEEKDAYS, parseLocalDate } from './jalali';

export interface SeriesPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
}

export interface SmartStats {
  days: number;
  avgIncome: number;
  avgExpense: number;
  topCategory: { name: string; total: number; count: number } | null;
  biggest: TransactionWithCategory | null;
  count: number;
}

function monthId(jy: number, jm: number): string {
  return `${jy}-${String(jm).padStart(2, '0')}`;
}

/** Jalali month and year for a local date. */
function jalaliMonthOf(date: Date): { jy: number; jm: number } {
  const { jy, jm } = toJalaali(date);
  return { jy, jm };
}

/**
 * Build monthly series for last N Jalali months.
 */
export function buildMonthlySeries(
  rows: TransactionWithCategory[],
  now: Date = new Date(),
  count = 6,
): SeriesPoint[] {
  const current = jalaliMonthOf(now);
  const points: SeriesPoint[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    let jy = current.jy;
    let jm = current.jm - offset;
    while (jm <= 0) {
      jm += 12;
      jy -= 1;
    }
    points.push({
      key: monthId(jy, jm),
      label: JALALI_MONTHS[jm - 1],
      income: 0,
      expense: 0,
    });
  }

  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const row of rows) {
    const date = parseLocalDate(row.date);
    if (!date || Number.isNaN(date.getTime())) continue;
    const { jy, jm } = jalaliMonthOf(date);
    const point = byKey.get(monthId(jy, jm));
    if (!point) continue;
    if (row.type === 'income') {
      point.income += row.amount;
    } else {
      point.expense += row.amount;
    }
  }

  return points;
}

/** Build daily series for last N days. */
export function buildDailySeries(
  rows: TransactionWithCategory[],
  now: Date = new Date(),
  count = 7,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const byKey = new Map<string, SeriesPoint>();

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const point: SeriesPoint = {
      key,
      label: JALALI_WEEKDAYS[date.getDay()].charAt(0),
      income: 0,
      expense: 0,
    };
    points.push(point);
    byKey.set(key, point);
  }

  for (const row of rows) {
    const date = parseLocalDate(row.date);
    if (!date || Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const point = byKey.get(key);
    if (!point) continue;
    if (row.type === 'income') {
      point.income += row.amount;
    } else {
      point.expense += row.amount;
    }
  }

  return points;
}

/**
 * Compute smart analytics metrics (daily averages, top category, biggest item).
 */
export function computeSmartStats(
  rows: TransactionWithCategory[],
  range: DateRange | null,
  now: Date = new Date(),
): SmartStats {
  let income = 0;
  let expense = 0;
  let biggest: TransactionWithCategory | null = null;
  const expenseByCategory = new Map<string, { name: string; total: number; count: number }>();

  for (const row of rows) {
    if (row.type === 'income') {
      income += row.amount;
    } else {
      expense += row.amount;
      const name = row.category_name ?? 'بدون دسته‌بندی';
      const current = expenseByCategory.get(name) ?? { name, total: 0, count: 0 };
      current.total += row.amount;
      current.count += 1;
      expenseByCategory.set(name, current);
    }
    if (!biggest || row.amount > biggest.amount) {
      biggest = row;
    }
  }

  let days = 1;
  if (range) {
    const start = parseLocalDate(range.startIso);
    const end = parseLocalDate(range.endIso);
    if (start && end) {
      const span = (end.getTime() - start.getTime()) / 86_400_000;
      days = Math.max(1, Math.round(span));
    }
  } else if (rows.length > 0) {
    const earliest = rows.reduce(
      (min, row) => Math.min(min, parseLocalDate(row.date)?.getTime() ?? now.getTime()),
      now.getTime(),
    );
    days = Math.max(1, Math.round((now.getTime() - earliest) / 86_400_000) + 1);
  }

  const topCategory =
    expenseByCategory.size === 0
      ? null
      : Array.from(expenseByCategory.values()).sort((a, b) => b.total - a.total)[0];

  return {
    days,
    avgIncome: Math.round(income / days),
    avgExpense: Math.round(expense / days),
    topCategory,
    biggest,
    count: rows.length,
  };
}

/** Calculate percentage share. */
export function sharePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export { toPersianDigits };

/**
 * Downsample X axis labels to prevent overlap on busy charts.
 */
export function pickAxisLabelIndices(length: number, maxLabels = 6): number[] {
  if (length <= 0 || maxLabels < 2) return [];
  if (length <= maxLabels) return Array.from({ length }, (_, index) => index);

  const last = length - 1;
  const span = maxLabels - 1;
  const indices = new Set<number>();
  for (let step = 0; step <= span; step += 1) {
    indices.add(Math.round((last * step) / span));
  }
  return Array.from(indices).sort((first, second) => first - second);
}

