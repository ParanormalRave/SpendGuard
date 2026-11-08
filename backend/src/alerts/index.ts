import {
  createAlert,
  getDb,
  type AlertInput as DbAlertInput,
  type AlertSeverity,
} from "../db";
import { notifyOwner } from "../notify";

/**
 * Alert types from AGENTS.md section 6.
 *
 * `PAYMENT_BLOCKED` is raised by the agent's tool layer (a `rejected` attempt),
 * the rest come from watcher events / anomaly rules in later M5 steps.
 */
export const ALERT_TYPES = [
  "WITHDRAWAL_REQUESTED",
  "WITHDRAWAL_EXECUTED",
  "WITHDRAWAL_CANCELLED",
  "PAYMENT_BLOCKED",
  "RECIPIENT_ADDED",
  "NEW_RECIPIENT_PAYMENT",
  "UNUSUAL_AMOUNT",
  "NEAR_WINDOW_LIMIT",
  "POLICY_PAUSED",
  "POLICY_RESUMED",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES: readonly AlertSeverity[] = ["info", "warning", "critical"];

/**
 * What a caller supplies to raise an alert.
 *
 * The storage shape lives in `../db`; here `type` is narrowed to the known
 * alert types, and `dedupeKey` is required:
 *   chain events:    `${type}:${policy}:${txSignature}`
 *   blocked payments `${type}:${policy}:${attemptId}`
 */
export interface AlertInput extends DbAlertInput {
  type: AlertType;
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/([?&]api-key=)[^&\s]+/gi, "$1***")
    .replace(/([?&]key=)[^&\s]+/gi, "$1***");
}

/**
 * Store an alert and (from M7) notify the owner.
 *
 * Duplicates on `dedupe_key` are ignored and return `null` without notifying,
 * so replaying events or backfilling can never double-alert. A notification
 * failure is logged and never rethrown.
 */
export async function raiseAlert(alert: AlertInput): Promise<AlertInput | null> {
  if (!(ALERT_TYPES as readonly string[]).includes(alert.type)) {
    throw new Error(`Unknown alert type "${alert.type}"`);
  }
  if (!ALERT_SEVERITIES.includes(alert.severity)) {
    throw new Error(`Unknown alert severity "${alert.severity}"`);
  }
  if (typeof alert.dedupeKey !== "string" || alert.dedupeKey.trim() === "") {
    throw new Error("Alert requires a non-empty dedupeKey");
  }

  const inserted = createAlert(getDb(), alert);

  // Duplicate: already stored (and already notified) earlier.
  if (!inserted) {
    return null;
  }

  try {
    await notifyOwner(alert);
  } catch (err: unknown) {
    // Hard rule 9: an alert must never block or crash the watcher.
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[alerts] notifyOwner failed for alert ${alert.dedupeKey}: ${sanitizeMessage(message)}`,
    );
  }

  return alert;
}
