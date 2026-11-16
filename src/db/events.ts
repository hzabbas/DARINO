import type { SqlDatabase } from '../types/models';

/**
 * Simple pub/sub change notification bus for database writes.
 * Supports synchronous listeners and debounced/coalesced subscriptions.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Coalesced listeners triggered after rapid bursts settle */
const coalescedListeners = new Set<Listener>();

/** Coalescing window in ms */
export const DB_CHANGE_COALESCE_MS = 60;

let coalesceTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeDbChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribes to debounced db changes */
export function subscribeDbChangeCoalesced(listener: Listener): () => void {
  coalescedListeners.add(listener);
  return () => {
    coalescedListeners.delete(listener);
  };
}

function scheduleCoalescedFlush(): void {
  if (coalesceTimer !== null) {
    clearTimeout(coalesceTimer);
  }
  coalesceTimer = setTimeout(flushDbChangeCoalesced, DB_CHANGE_COALESCE_MS);
}

/** Flushes queued coalesced notifications synchronously */
export function flushDbChangeCoalesced(): void {
  if (coalesceTimer !== null) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }

  // Clone listener list to protect against mid-iteration mutation
  for (const listener of [...coalescedListeners]) {
    try {
      listener();
    } catch {
      // Isolate listener error
    }
  }
}

/** Checks whether coalesced flush timer is active */
export function hasPendingDbChangeFlush(): boolean {
  return coalesceTimer !== null;
}

export function notifyDbChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Isolate listener error
    }
  });

  scheduleCoalescedFlush();
}

/** Clears all listeners and active timers (for testing) */
export function resetDbChangeListeners(): void {
  listeners.clear();
  coalescedListeners.clear();
  if (coalesceTimer !== null) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
}

export type { SqlDatabase };
