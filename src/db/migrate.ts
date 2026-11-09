import type { SqlDatabase } from '../types/models';
import { seedDefaultCategories } from './seed';
import { PRAGMAS_SQL, SCHEMA_SQL, SCHEMA_VERSION } from './schema';

export function getSchemaVersion(db: SqlDatabase): number {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * ساخت جدول‌ها (idempotent) و درج داده‌های اولیه.
 * چون SCHEMA_SQL از IF NOT EXISTS استفاده می‌کند، اجرای دوباره‌اش بی‌خطر است.
 */
export function migrate(db: SqlDatabase): { seeded: number; version: number } {
  db.execSync(PRAGMAS_SQL);
  db.execSync(SCHEMA_SQL);

  const seeded = seedDefaultCategories(db);
  db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  return { seeded, version: SCHEMA_VERSION };
}
