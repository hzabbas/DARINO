/**
 * Sanitizes SQLite bind parameters to prevent undefined or NaN reaching native layer.
 */
export type SqlParam = string | number | null;

/** Converts input value to safe SQLite parameter */
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
