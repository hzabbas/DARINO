import type { SqlDatabase } from '../types/models';
import { notifyDbChange } from './events';
import { getWebStore, persistWebStore } from './store.web';

/**
 * تنظیمات در نسخه‌ی وب؛ همان قرارداد settings.ts اما روی localStorage.
 */
export function getSetting(_db: SqlDatabase, key: string): string | null {
  const store = getWebStore();
  return Object.prototype.hasOwnProperty.call(store.settings, key) ? store.settings[key] : null;
}

export function setSetting(_db: SqlDatabase, key: string, value: string): void {
  const store = getWebStore();
  store.settings = { ...store.settings, [key]: value };
  persistWebStore();
  notifyDbChange();
}

export function deleteSetting(_db: SqlDatabase, key: string): void {
  const store = getWebStore();
  const next = { ...store.settings };
  delete next[key];
  store.settings = next;
  persistWebStore();
  notifyDbChange();
}

export function getAllSettings(_db: SqlDatabase): Record<string, string> {
  return { ...getWebStore().settings };
}

export function getNumericSetting(db: SqlDatabase, key: string): number {
  const raw = getSetting(db, key);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** کلید تنظیم «احتساب موجودی کارت‌ها در درآمد» ('1' یا '0'؛ پیش‌فرض '0'). */
export const INCLUDE_BANK_BALANCE_IN_INCOME_KEY = 'include_bank_balance_in_income';

export function isBankBalanceIncluded(db: SqlDatabase): boolean {
  return getSetting(db, INCLUDE_BANK_BALANCE_IN_INCOME_KEY) === '1';
}

export function setBankBalanceIncluded(db: SqlDatabase, include: boolean): void {
  setSetting(db, INCLUDE_BANK_BALANCE_IN_INCOME_KEY, include ? '1' : '0');
}
