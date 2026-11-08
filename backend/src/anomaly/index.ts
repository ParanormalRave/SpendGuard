import type { AlertInput } from "../alerts";
import type { RecipientStats } from "../db";
import { loadConfig } from "../config";

/**
 * Anomaly rules from AGENTS.md section 6.
 *
 * `detectAnomalies` is pure: it accepts the recipient's earlier-payment stats
 * and the policy window state, and returns the alerts to raise. It never reads
 * the chain, the database or the clock, so the caller decides the order
 * (`getRecipientStats` before `savePayment`) and the tests need no fixtures.
 *
 * Alerts never block anything — only the on-chain program does (hard rule 9).
 */

export interface AnomalyThresholds {
  /** UNUSUAL_MULTIPLIER: how many times the recipient's average is "unusual". */
  unusualMultiplier: number;
  /** UNUSUAL_MIN_HISTORY: earlier payments needed before the average is trusted. */
  unusualMinHistory: number;
  /** NEAR_LIMIT_PERCENT: alert once this percentage of the window limit is spent. */
  nearLimitPercent: number;
}

export interface AnomalyPayment {
  policy: string;
  recipient: string;
  amountLamports: number;
  txSignature: string;
  /** Earlier payments ONLY: read before the new payment is saved. */
  recipientStats: RecipientStats;
}

export interface AnomalyPolicyState {
  owner: string;
  /** `spent_in_window` AFTER this payment, taken from the event. */
  spentInWindow: number;
  windowLimit: number;
}

/** Reads the three thresholds from the environment (defaults 3 / 3 / 80). */
export function thresholdsFromConfig(): AnomalyThresholds {
  const config = loadConfig();
  return {
    unusualMultiplier: config.unusualMultiplier,
    unusualMinHistory: config.unusualMinHistory,
    nearLimitPercent: config.nearLimitPercent,
  };
}

/**
 * Returns the alerts this payment should raise, in a stable order:
 * new recipient, unusual amount, near window limit.
 */
export function detectAnomalies(
  payment: AnomalyPayment,
  policyState: AnomalyPolicyState,
  thresholds: AnomalyThresholds = thresholdsFromConfig(),
): AlertInput[] {
  const alerts: AlertInput[] = [];
  const { recipientStats } = payment;

  // 1) First successful payment to this recipient.
  if (recipientStats.count === 0) {
    alerts.push({
      policy: payment.policy,
      owner: policyState.owner,
      type: "NEW_RECIPIENT_PAYMENT",
      severity: "warning",
      title: "First payment to a new recipient",
      message:
        `First successful payment of ${payment.amountLamports} lamports ` +
        `to ${payment.recipient}.`,
      data: {
        recipient: payment.recipient,
        amountLamports: payment.amountLamports,
        previousPayments: 0,
      },
      txSignature: payment.txSignature,
      dedupeKey: `NEW_RECIPIENT_PAYMENT:${payment.policy}:${payment.txSignature}`,
    });
  }

  // 2) Much larger than this recipient's usual payment.
  if (isUnusualAmount(payment, thresholds)) {
    alerts.push({
      policy: payment.policy,
      owner: policyState.owner,
      type: "UNUSUAL_AMOUNT",
      severity: "warning",
      title: "Unusual payment amount",
      message:
        `Payment of ${payment.amountLamports} lamports to ${payment.recipient} is ` +
        `${thresholds.unusualMultiplier}x its usual average of ` +
        `${recipientStats.averageAmount} lamports over ${recipientStats.count} earlier payments.`,
      data: {
        recipient: payment.recipient,
        amountLamports: payment.amountLamports,
        averageAmount: recipientStats.averageAmount,
        totalAmount: recipientStats.totalAmount,
        previousPayments: recipientStats.count,
        unusualMultiplier: thresholds.unusualMultiplier,
      },
      txSignature: payment.txSignature,
      dedupeKey: `UNUSUAL_AMOUNT:${payment.policy}:${payment.txSignature}`,
    });
  }

  // 3) Spending has reached the configured share of the window limit.
  if (isNearWindowLimit(policyState, thresholds)) {
    const percent =
      policyState.windowLimit > 0
        ? Math.round((policyState.spentInWindow / policyState.windowLimit) * 100)
        : 100;
    alerts.push({
      policy: payment.policy,
      owner: policyState.owner,
      type: "NEAR_WINDOW_LIMIT",
      severity: "warning",
      title: "Spending near the window limit",
      message:
        `${policyState.spentInWindow} of ${policyState.windowLimit} lamports spent ` +
        `in this window (${percent}%, alert threshold ${thresholds.nearLimitPercent}%).`,
      data: {
        recipient: payment.recipient,
        amountLamports: payment.amountLamports,
        spentInWindow: policyState.spentInWindow,
        windowLimit: policyState.windowLimit,
        nearLimitPercent: thresholds.nearLimitPercent,
      },
      txSignature: payment.txSignature,
      dedupeKey: `NEAR_WINDOW_LIMIT:${payment.policy}:${payment.txSignature}`,
    });
  }

  return alerts;
}

/**
 * `amount > multiplier * average` with exact integer arithmetic.
 *
 * The stored average is floored, so comparing against it could miss or invent
 * an edge case; cross-multiplying with the exact total avoids that:
 * `amount > multiplier * total / count` <=> `amount * count > multiplier * total`.
 * A non-integer multiplier falls back to a float comparison — threshold config
 * only, never money storage.
 */
function isUnusualAmount(payment: AnomalyPayment, thresholds: AnomalyThresholds): boolean {
  const stats = payment.recipientStats;
  // `count > 0`: an average of no payments is meaningless, and a first payment
  // already raises NEW_RECIPIENT_PAYMENT (even if UNUSUAL_MIN_HISTORY is 0).
  if (stats.count <= 0 || stats.count < thresholds.unusualMinHistory) {
    return false;
  }
  if (stats.totalAmount < 0 || payment.amountLamports < 0) {
    return false;
  }

  if (Number.isInteger(thresholds.unusualMultiplier)) {
    return (
      BigInt(payment.amountLamports) * BigInt(stats.count) >
      BigInt(thresholds.unusualMultiplier) * BigInt(stats.totalAmount)
    );
  }

  return payment.amountLamports > thresholds.unusualMultiplier * (stats.totalAmount / stats.count);
}

/**
 * `spent >= percent% of window_limit`, exactly as AGENTS.md specifies:
 * integer cross-multiplication, never floating point or rounding.
 */
function isNearWindowLimit(
  policyState: AnomalyPolicyState,
  thresholds: AnomalyThresholds,
): boolean {
  if (policyState.windowLimit <= 0 || policyState.spentInWindow <= 0) {
    return false;
  }
  return (
    BigInt(policyState.spentInWindow) * 100n >=
    BigInt(policyState.windowLimit) * BigInt(thresholds.nearLimitPercent)
  );
}
