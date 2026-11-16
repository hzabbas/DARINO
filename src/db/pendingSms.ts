import type { NewPendingSms, PendingSms, PendingSmsStatus, SqlDatabase } from '../types/models';
import { toLocalIso } from '../utils/jalali';
import { isPostBalanceAnchor } from './accountRules';
import {
  adjustAccountBalance,
  applyTransactionDelta,
  getBankAccount,
  setAccountBalance,
} from './bankAccounts';
import { createCategory, listCategories } from './categories';
import { notifyDbChange } from './events';
import { balanceEffect, createTransaction, getTransaction } from './transactions';
import { runInTransaction } from './transaction';

const COLUMNS = `id, sms_id, sender, bank_account_id, raw_body, detected_type, amount, fee_amount,
  roundup_amount, detected_balance, date, shamsi_date, time, transfer_pair_id, status, created_at,
  merchant, suggested_category_id`;

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

/** Inserts pending SMS record into confirmation queue */
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
       roundup_amount, detected_balance, date, shamsi_date, time, transfer_pair_id, status,
       created_at, merchant, suggested_category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, ?)`,
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
    input.merchant ?? null,
    input.suggested_category_id ?? null,
  );

  const row = db.getFirstSync<PendingSms>(
    `SELECT ${COLUMNS} FROM pending_sms WHERE sms_id = ?`,
    input.sms_id,
  );
  notifyDbChange();
  return { inserted: true, row };
}

/** Ensures "Bank Fee" category exists */
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
  /** Category ID (required for income/expense) */
  categoryId?: number | null;
}

/** Timestamp derived from SMS date */
export function pendingSmsTimestamp(row: PendingSms): number {
  const parsed = new Date(row.date).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** Approves pending SMS and turns it into a real transaction */
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

      createTransaction(
        db,
        {
          amount: row.amount,
          type: row.detected_type,
          category_id: input.categoryId,
          date: row.date,
          shamsi_date: row.shamsi_date,
          note: row.merchant,
          bank_account_id: row.bank_account_id,
        },
        { applyBalanceEffect: row.detected_balance === null },
      );

      if (row.bank_account_id) {
        if (row.detected_balance !== null) {
          setAccountBalance(
            db,
            row.bank_account_id,
            row.detected_balance,
            pendingSmsTimestamp(row),
          );
        }
      }
    }

    db.runSync("UPDATE pending_sms SET status = 'approved' WHERE id = ?", row.id);
  });

  notifyDbChange();
  return true;
}

export interface MergePendingResult {
  merged: boolean;
  transactionId: number | null;
  /** Whether bank balance was updated by this SMS balance */
  balanceApplied: boolean;
}

/** Merges pending SMS with existing manual transaction */
export function mergePendingSmsWithTransaction(
  db: SqlDatabase,
  input: { pendingId: number; transactionId: number },
): MergePendingResult {
  const row = getPendingSms(db, input.pendingId);
  const target = getTransaction(db, input.transactionId);

  if (!row || row.status !== 'pending' || !target || row.detected_type === 'transfer') {
    return { merged: false, transactionId: null, balanceApplied: false };
  }

  const accountId = row.bank_account_id;
  const previousAccountId = target.bank_account_id;
  const sameAccount = accountId !== null && previousAccountId === accountId;
  let balanceApplied = false;

  runInTransaction(db, () => {
    if (previousAccountId && previousAccountId !== accountId) {
      const prevAccount = getBankAccount(db, previousAccountId);
      if (prevAccount && isPostBalanceAnchor(prevAccount, target.date)) {
        adjustAccountBalance(
          db,
          previousAccountId,
          -balanceEffect(target.amount, target.type),
        );
      }
    }

    db.runSync(
      `UPDATE transactions
       SET bank_account_id = ?, note = COALESCE(NULLIF(note, ''), ?)
       WHERE id = ?`,
      accountId,
      row.merchant,
      target.id,
    );

    if (accountId) {
      if (row.detected_balance !== null) {
        setAccountBalance(db, accountId, row.detected_balance, pendingSmsTimestamp(row));
        balanceApplied = true;
      } else if (!sameAccount) {
        balanceApplied = applyTransactionDelta(
          db,
          accountId,
          balanceEffect(target.amount, target.type),
          target.date,
        );
      }
    }

    db.runSync("UPDATE pending_sms SET status = 'approved' WHERE id = ?", row.id);
  });

  notifyDbChange();
  return { merged: true, transactionId: target.id, balanceApplied };
}

/** Ignores all pending messages before a given timestamp */
export function ignorePendingSmsBefore(db: SqlDatabase, timestamp: number): number {
  const rows = db.getAllSync<{ id: number }>(
    "SELECT id FROM pending_sms WHERE status = 'pending' AND date < ?",
    toLocalIso(new Date(timestamp)),
  );
  db.runSync(
    "UPDATE pending_sms SET status = 'ignored' WHERE status = 'pending' AND date < ?",
    toLocalIso(new Date(timestamp)),
  );
  notifyDbChange();
  return rows.length;
}

/** Count pending SMS before a given timestamp */
export function countPendingSmsBefore(db: SqlDatabase, timestamp: number): number {
  const row = db.getFirstSync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM pending_sms WHERE status = 'pending' AND date < ?",
    toLocalIso(new Date(timestamp)),
  );
  return row?.total ?? 0;
}

/** Clears all pending SMS currently waiting for approval */
export function clearPendingSmsQueue(db: SqlDatabase): number {
  const row = db.getFirstSync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM pending_sms WHERE status = 'pending'",
  );
  db.runSync("DELETE FROM pending_sms WHERE status = 'pending'");
  notifyDbChange();
  return row?.total ?? 0;
}

/** Deletes all rows from pending_sms table */
export function deleteAllPendingSms(db: SqlDatabase): number {
  const row = db.getFirstSync<{ total: number }>('SELECT COUNT(*) AS total FROM pending_sms');
  db.runSync('DELETE FROM pending_sms');
  notifyDbChange();
  return row?.total ?? 0;
}

export function ignorePendingSms(db: SqlDatabase, id: number): void {
  db.runSync("UPDATE pending_sms SET status = 'ignored' WHERE id = ?", id);
  notifyDbChange();
}

export function deletePendingSms(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM pending_sms WHERE id = ?', id);
  notifyDbChange();
}

/** Links two pending messages as a self-transfer pair */
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

/** Account title for UI display */
export function getPendingAccountTitle(db: SqlDatabase, accountId: number | null): string | null {
  if (!accountId) return null;
  return getBankAccount(db, accountId)?.title ?? null;
}
