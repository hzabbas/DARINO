import type { Category, NewCategory, SqlDatabase, TransactionType } from '../types/models';

const CATEGORY_COLUMNS = 'id, name, type, icon, color';

export function listCategories(db: SqlDatabase, type?: TransactionType): Category[] {
  if (type) {
    return db.getAllSync<Category>(
      `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE type = ? ORDER BY id ASC`,
      type,
    );
  }
  return db.getAllSync<Category>(`SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY id ASC`);
}

export function getCategory(db: SqlDatabase, id: number): Category | null {
  return db.getFirstSync<Category>(
    `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = ?`,
    id,
  );
}

export function countCategories(db: SqlDatabase, type?: TransactionType): number {
  const row = type
    ? db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM categories WHERE type = ?', type)
    : db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM categories');
  return row?.total ?? 0;
}

export function createCategory(db: SqlDatabase, category: NewCategory): number {
  const name = category.name.trim();
  if (!name) {
    throw new Error('نام دسته‌بندی نمی‌تواند خالی باشد');
  }

  const result = db.runSync(
    'INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)',
    name,
    category.type,
    category.icon,
    category.color,
  );
  return result.lastInsertRowId;
}

export function updateCategory(db: SqlDatabase, id: number, category: NewCategory): void {
  const name = category.name.trim();
  if (!name) {
    throw new Error('نام دسته‌بندی نمی‌تواند خالی باشد');
  }

  db.runSync(
    'UPDATE categories SET name = ?, type = ?, icon = ?, color = ? WHERE id = ?',
    name,
    category.type,
    category.icon,
    category.color,
    id,
  );
}

/**
 * حذف دسته‌بندی. به‌خاطر ON DELETE SET NULL، تراکنش‌های قبلی حذف نمی‌شوند
 * و فقط دسته‌بندی‌شان خالی می‌شود.
 */
export function deleteCategory(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM categories WHERE id = ?', id);
}

/** تعداد تراکنش‌های هر دسته‌بندی؛ برای نمایش «۳ تراکنش» در لیست دسته‌ها. */
export function getCategoryUsageCounts(db: SqlDatabase): Record<number, number> {
  const rows = db.getAllSync<{ category_id: number; total: number }>(
    'SELECT category_id, COUNT(*) AS total FROM transactions WHERE category_id IS NOT NULL GROUP BY category_id',
  );

  const counts: Record<number, number> = {};
  for (const row of rows) {
    counts[row.category_id] = row.total;
  }
  return counts;
}
