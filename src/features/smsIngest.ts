import { findAccountBySender, isBeforeSyncWindow, listBankAccounts, setAccountBalance } from '../db/bankAccounts';
import { insertPendingSms, linkPendingPair, listPendingSms } from '../db/pendingSms';
import type { BankAccount, PendingSms, SqlDatabase } from '../types/models';
import { sendersMatch } from '../utils/iranianBanks';
import { toLocalIso } from '../utils/jalali';
import {
  createSmsId,
  detectSelfTransfers,
  normalizeSmsBody,
  parseBankSms,
  type ParsedSms,
} from '../utils/smsParser';
import { suggestCategory, type CategorySuggestion } from './categorySuggest';

export type IngestStatus =
  | 'queued'
  | 'duplicate'
  | 'ignored-otp'
  | 'ignored-unknown'
  | 'unmatched-account'
  | 'before-sync-window';

export interface IngestResult {
  status: IngestStatus;
  parsed: ParsedSms;
  pending: PendingSms | null;
  account: BankAccount | null;
  /** Suggested category for this SMS */
  suggestion: CategorySuggestion | null;
}

function matchAccount(db: SqlDatabase, sender: string, bankCode: string | undefined): BankAccount | null {
  const direct = findAccountBySender(db, sender);
  if (direct) return direct;
  if (!bankCode) return null;

  // Infer single bank account if senders list is still empty
  const sameBank = listBankAccounts(db, true).filter((account) => account.bank_code === bankCode);
  const withoutSenders = sameBank.filter((account) => account.senders.length === 0);
  if (sameBank.length === 1 && withoutSenders.length === 1) return sameBank[0];
  return null;
}

/** Dedup window: tolerance for PDU vs ContentResolver timestamp difference */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

/** Deduplicates pending SMS within ±2 minutes window */
function findDuplicatePendingSms(
  db: SqlDatabase,
  input: { accountId: number; body: string; amount: number; timestamp: number },
): PendingSms | null {
  const from = toLocalIso(new Date(input.timestamp - DUPLICATE_WINDOW_MS));
  const to = toLocalIso(new Date(input.timestamp + DUPLICATE_WINDOW_MS));

  const rows = db.getAllSync<PendingSms>(
    `SELECT id, sms_id, sender, bank_account_id, raw_body, detected_type, amount, fee_amount,
            roundup_amount, detected_balance, date, shamsi_date, time, transfer_pair_id, status,
            created_at, merchant, suggested_category_id
       FROM pending_sms
      WHERE bank_account_id = ? AND date >= ? AND date <= ?`,
    input.accountId,
    from,
    to,
  );

  const bodyKey = normalizeSmsBody(input.body);
  const amount = Math.trunc(input.amount);
  return (
    rows.find(
      (row) => normalizeSmsBody(row.raw_body) === bodyKey && Math.trunc(row.amount) === amount,
    ) ?? null
  );
}

/** Ingests single SMS from native receiver, sync, or emulator */
export function ingestBankSms(
  db: SqlDatabase,
  input: { sender: string; body: string; receivedAt?: Date },
): IngestResult {
  const receivedAt = input.receivedAt ?? new Date();
  const parsed = parseBankSms({ sender: input.sender, body: input.body, receivedAt });

  if (parsed.kind === 'otp') {
    return { status: 'ignored-otp', parsed, pending: null, account: null, suggestion: null };
  }
  if (parsed.kind !== 'transaction' || !parsed.type || parsed.amount <= 0) {
    return { status: 'ignored-unknown', parsed, pending: null, account: null, suggestion: null };
  }

  const account = matchAccount(db, input.sender, parsed.bank?.code);
  if (!account) {
    return { status: 'unmatched-account', parsed, pending: null, account: null, suggestion: null };
  }

  // Respect account sync boundary
  if (isBeforeSyncWindow(account, receivedAt)) {
    return { status: 'before-sync-window', parsed, pending: null, account, suggestion: null };
  }

  const timestamp = receivedAt.getTime();
  const duplicate = findDuplicatePendingSms(db, {
    accountId: account.id,
    body: input.body,
    amount: parsed.amount,
    timestamp,
  });
  if (duplicate) {
    return { status: 'duplicate', parsed, pending: duplicate, account, suggestion: null };
  }

  const smsId = createSmsId({
    sender: input.sender,
    body: input.body,
    amount: parsed.amount,
    timestamp,
  });

  // Suggest category based on merchant history or keywords
  const suggestion = suggestCategory(db, {
    merchant: parsed.merchant,
    type: parsed.type,
    body: input.body,
  });

  const { inserted, row } = insertPendingSms(db, {
    sms_id: smsId,
    sender: input.sender,
    bank_account_id: account.id,
    raw_body: input.body,
    detected_type: parsed.type,
    amount: parsed.amount,
    fee_amount: 0,
    roundup_amount: parsed.roundup,
    detected_balance: parsed.balance,
    date: parsed.dateIso ?? toLocalIso(receivedAt),
    shamsi_date: parsed.shamsi ?? '',
    time: parsed.time,
    merchant: parsed.merchant,
    suggested_category_id: suggestion?.categoryId ?? null,
  });

  if (inserted && parsed.balance !== null) {
    // Bank balance is single source of truth; update anchor
    setAccountBalance(db, account.id, parsed.balance, timestamp);
  }

  if (inserted) {
    pairPendingTransfers(db);
  }

  return {
    status: inserted ? 'queued' : 'duplicate',
    parsed,
    pending: row,
    account,
    suggestion,
  };
}

/**
 * Concurrency mutex for SMS synchronization.
 * Prevents race condition between app focus, mount, and background receivers.
 */
let ingestLock = false;

export function acquireIngestLock(): (() => void) | null {
  if (ingestLock) return null;

  ingestLock = true;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    ingestLock = false;
  };
}

export function isIngestRunning(): boolean {
  return ingestLock;
}

/** Reset mutex (for test teardown). */
export function resetIngestLock(): void {
  ingestLock = false;
}

/**
 * Pairs self-transfer transactions across accounts in the last 2 hours.
 */
export function pairPendingTransfers(db: SqlDatabase): number {
  const allRows = listPendingSms(db, 'pending').filter(
    (row) => row.detected_type === 'income' || row.detected_type === 'expense',
  );
  if (allRows.length < 2) return 0;

  // Window relative to the newest SMS
  const newest = allRows.reduce(
    (max, row) => Math.max(max, new Date(row.date).getTime()),
    Number.NEGATIVE_INFINITY,
  );
  const rows = allRows.filter((row) => newest - new Date(row.date).getTime() <= 2 * 60 * 60 * 1000);

  const links = detectSelfTransfers(
    rows.map((row) => ({
      id: row.id,
      bankAccountId: row.bank_account_id,
      type: row.detected_type as 'income' | 'expense',
      amount: row.amount,
      dateIso: row.date,
    })),
  );

  for (const link of links) {
    linkPendingPair(db, link.expenseId, link.incomeId, link.fee);
  }

  return links.length;
}

// ---------------------------------------------------------------------------
// Pending SMS Focus Signal
// ---------------------------------------------------------------------------

export type PendingSmsFocus = {
  /** Target SMS ID */
  smsId: string | null;
  timestamp: number;
};

let pendingFocus: PendingSmsFocus | null = null;
const focusListeners = new Set<(focus: PendingSmsFocus) => void>();

/** Request pending queue modal to open focused on a target SMS. */
export function requestPendingSmsFocus(smsId: string | null = null, now = Date.now()): void {
  pendingFocus = { smsId, timestamp: now };
  for (const listener of focusListeners) {
    listener(pendingFocus);
  }
}

/** Consumes the focus signal. */
export function consumePendingSmsFocus(): PendingSmsFocus | null {
  const current = pendingFocus;
  pendingFocus = null;
  return current;
}

/** Peek active focus without consuming. */
export function peekPendingSmsFocus(): PendingSmsFocus | null {
  return pendingFocus;
}

/** Subscribe to focus requests. */
export function subscribePendingSmsFocus(
  listener: (focus: PendingSmsFocus) => void,
): () => void {
  focusListeners.add(listener);
  return () => {
    focusListeners.delete(listener);
  };
}

/** Reset focus state (for tests). */
export function resetPendingSmsFocus(): void {
  pendingFocus = null;
  focusListeners.clear();
}

/** Extracts SMS fingerprint from deep-link URI. */
export function smsFingerprintFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = 'darino://';
  if (!url.startsWith(marker)) return null;

  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;

  for (const pair of url.slice(queryStart + 1).split('&')) {
    const [rawKey, rawValue] = pair.split('=');
    if (rawKey === 'sms' && rawValue) {
      return decodeURIComponent(rawValue);
    }
  }
  return null;
}

/** Whether the deep-link URL targets the pending SMS queue. */
export function isPendingSmsUrl(url: string | null | undefined): boolean {
  if (!url || !url.startsWith('darino://')) return false;
  return url.includes('pending-sms') || url.includes('openPendingSms=1') || url.includes('open=1');
}

/** Resolves pending SMS ID from notification fingerprint. */
export function resolveFocusedSmsId(
  db: SqlDatabase,
  fingerprint: string | null,
  url: string | null = null,
): string | null {
  const raw = fingerprint ?? smsFingerprintFromUrl(url);
  if (!raw) return null;

  const parts = raw.split('|');
  if (parts.length < 2) return null;

  const sender = parts[0];
  const timestamp = Number(parts[parts.length - 1]);
  if (!Number.isFinite(timestamp)) return null;

  const match = listPendingSms(db, 'pending').find((row) => {
    const rowTime = new Date(row.date).getTime();
    if (!Number.isFinite(rowTime)) return false;
    return Math.abs(rowTime - timestamp) < 60_000 && sendersMatch(row.sender, sender);
  });
  return match?.sms_id ?? null;
}