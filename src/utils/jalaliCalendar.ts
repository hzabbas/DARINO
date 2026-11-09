import { jalaaliMonthLength, toGregorian } from 'jalaali-js';

/**
 * شبکه‌ی روزهای یک ماه شمسی برای تقویم.
 * هفته از شنبه شروع می‌شود (ستون اول) و خانه‌های خالی با null پر می‌شوند.
 */
export function buildJalaliMonthGrid(jy: number, jm: number): (number | null)[][] {
  const monthLength = jalaaliMonthLength(jy, jm);
  const first = toGregorian(jy, jm, 1);
  const firstDate = new Date(first.gy, first.gm - 1, first.gd);
  const leadingBlanks = (firstDate.getDay() + 1) % 7; // شنبه = ۰

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

/** تاریخ شمسی یک روز از ماه را به Date میلادی (با ساعت مشخص) تبدیل می‌کند. */
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
