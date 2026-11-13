/**
 * پاک‌سازی پارامترهای SQLite.
 *
 * `expo-sqlite` هنگام بایند کردن پارامتر، `undefined` و `NaN` را قبول نمی‌کند و در
 * نسخه‌ی نیتیو یک خطای HostFunction می‌دهد که در جاوااسکریپت قابل گرفتن نیست —
 * یعنی اپ همین‌جا می‌میرد. چون لایه‌ی داده از ده‌ها ماژول پارامتر می‌فرستد، به‌جای
 * تکیه بر این‌که همه‌ی آن‌ها بی‌عیب باشند، همه‌ی پارامترها از یک گلوگاه عبور می‌کنند
 * (`client.ts`).
 */
export type SqlParam = string | number | null;

/**
 * یک مقدار را به پارامتر امن SQLite تبدیل می‌کند.
 *
 * - `undefined` → `null` (مهم‌ترین مورد: ستون اختیاری که پر نشده)
 * - `NaN` / `Infinity` → `0` (عدد نامعتبر نباید به لایه‌ی نیتیو برسد)
 * - `true/false` → `1/0` (SQLite بولی ندارد)
 */
export function sanitizeSqlParam(value: unknown): SqlParam {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function sanitizeSqlParams(values: readonly unknown[]): SqlParam[] {
  return values.map(sanitizeSqlParam);
}
