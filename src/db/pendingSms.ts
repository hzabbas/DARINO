import type { NewPendingSms, PendingSms, PendingSmsStatus, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { adjustAccountBalance, getBankAccount, setAccountBalance } from './bankAccounts';
import { createCategory, listCategories } from './categories';
import { notifyDbChange } from './events';
import { createTransaction } from './transactions';
import { runInTransaction } from './transaction';

const COLUMNS = `id, sms_id, sender, bank_account_id, raw_body, detected_type, amount, fee_amount,
  roundup_amount, detected_balance, date, shamsi_date, time, transfer_pair_id, status, created_at`;

export function getPendingSms(db: SqlDatabase, id: number): PendingSms | null {
  return db.getFirstSync<PendingSms>(`SELECT ${COLUMNS} FROM pending_sms WHERE id = ?`, id);
}

export function listPendingSms(
  db: SqlDatabase,
  status: PendingSmsStatus | 'all' = 'pending',
): PendingSms[] {
  if (status === 'all') {
    return db.getAllSync<PendingSms>(`SELECT ${COLUMNS} FROM pending_sms ORDER BY date DESC, id DESC`);
  }
  return db.getAllSync<PendingSms>(
    `SELECT ${COLUMNS} FROM pending_sms WHERE status = ? ORDER BY date DESC, id DESC`,
    status,
  );
}

export function countPendingSms(db: SqlDatabase): number {
  const row = db.getFirstSync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM pending_sms WHERE status = 'pending'",
  );
  return row?.total ?? 0;
}

/**
 * ثبت پیامک در صف تایید؛ `sms_id` یکتاست، پس پیامک تکراری دوباره ثبت نمی‌شود.
 */
export function insertPendingSms(
  db: SqlDatabase,
  input: NewPendingSms,
): { inserted: boolean; row: PendingSms | null } {
  const existing = db.getFirstSync<PendingSms>(
    `SELECT ${COLUMNS} FROM pending_sms WHERE sms_id = ?`,
    input.sms_id,
  );
  if (existing) {
    return { inserted: false, row: existing };
  }

  db.runSync(
    `INSERT INTO pending_sms
      (sms_id, sender, bank_account_id, raw_body, detected_type, amount, fee_amount,
       roundup_amount, detected_balance, date, shamsi_date, time, transfer_pair_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?)`,
    input.sms_id,
    input.sender,
    input.bank_account_id,
    input.raw_body,
    input.detected_type,
    Math.max(0, Math.trunc(input.amount)),
    Math.trunc(input.fee_amount ?? 0),
    Math.trunc(input.roundup_amount ?? 0),
    input.detected_balance ?? null,
    input.date,
    input.shamsi_date,
    input.time ?? null,
    toLocalIso(new Date()),
  );

  const row = db.getFirstSync<PendingSms>(
    `SELECT ${COLUMNS} FROM pending_sms WHERE sms_id = ?`,
    input.sms_id,
  );
  notifyDbChange();
  return { inserted: true, row };
}

/** دسته‌بندی «کارمزد بانکی» را در صورت نبود می‌سازد. */
export function ensureBankFeeCategory(db: SqlDatabase): number {
  const existing = listCategories(db, 'expense').find((category) => category.name === 'کارمزد بانکی');
  if (existing) return existing.id;

  return createCategory(db, {
    name: 'کارمزد بانکی',
    type: 'expense',
    icon: 'cash-outline',
    color: '#64748B',
  });
}

export interface ApprovePendingInput {
  id: number;
  /** برای هزینه/درآمد الزامی است */
  categoryId?: number | null;
}

/**
 * تایید یک پیامک:
 *  - هزینه/درآمد → یک تراکنش واقعی ساخته می‌شود و موجودی حساب هم‌تراز می‌شود
 *  - انتقال بین حساب‌های خودم → فقط کارمزد (اگر باشد) در «کارمزد بانکی» ثبت می‌شود
 */
export function approvePendingSms(db: SqlDatabase, input: ApprovePendingInput): boolean {
  const row = getPendingSms(db, input.id);
  if (!row || row.status !== 'pending') {
    return false;
  }

  runInTransaction(db, () => {
    if (row.detected_type === 'transfer') {
      if (row.fee_amount > 0) {
        createTransaction(db, {
          amount: row.fee_amount,
          type: 'expense',
          category_id: ensureBankFeeCategory(db),
          date: row.date,
          shamsi_date: row.shamsi_date,
          note: 'کارمزد انتقال بین حساب‌ها',
        });
      }
    } else {
      if (!input.categoryId) {
        throw new Error('برای ثبت این پیامک یک دسته‌بندی انتخاب کن');
      }

      createTransaction(db, {
        amount: row.amount,
        type: row.detected_type,
        category_id: input.categoryId,
        date: row.date,
        shamsi_date: row.shamsi_date,
        note: null,
      });

      if (row.bank_account_id) {
        if (row.detected_balance !== null) {
          setAccountBalance(db, row.bank_account_id, row.detected_balance);
        } else {
          adjustAccountBalance(
            db,
            row.bank_account_id,
            row.detected_type === 'income' ? row.amount : -row.amount,
          );
        }
      }
    }

    db.runSync("UPDATE pending_sms SET status = 'approved' WHERE id = ?", row.id);
  });

  notifyDbChange();
  return true;
}

export function ignorePendingSms(db: SqlDatabase, id: number): void {
  db.runSync("UPDATE pending_sms SET status = 'ignored' WHERE id = ?", id);
  notifyDbChange();
}

export function deletePendingSms(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM pending_sms WHERE id = ?', id);
  notifyDbChange();
}

/**
 * دو پیامک را به‌عنوان «انتقال بین حساب‌های خودم» علامت می‌زند؛
 * کارمزد روی ردیف برداشت ذخیره می‌شود.
 */
export function linkPendingPair(
  db: SqlDatabase,
  expenseId: number,
  incomeId: number,
  fee: number,
): void {
  const pairId = `pair_${expenseId}_${incomeId}`;
  db.runSync(
    "UPDATE pending_sms SET detected_type = 'transfer', transfer_pair_id = ?, fee_amount = ? WHERE id = ?",
    pairId,
    Math.max(0, Math.trunc(fee)),
    expenseId,
  );
  db.runSync(
    "UPDATE pending_sms SET detected_type = 'transfer', transfer_pair_id = ?, fee_amount = 0 WHERE id = ?",
    pairId,
    incomeId,
  );
  notifyDbChange();
}

/** آخرین حساب بانکی متصل، برای نمایش در کارت‌های UI */
export function getPendingAccountTitle(db: SqlDatabase, accountId: number | null): string | null {
  if (!accountId) return null;
  return getBankAccount(db, accountId)?.title ?? null;
}
