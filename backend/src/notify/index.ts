import type { AlertInput } from "../db";

/**
 * Email the owner when an alert clears their severity preference.
 *
 * This is a deliberate no-op until M7 wires up Google sign-in, preferences and
 * SMTP (`sendEmail`, `buildAlertEmail`). `raiseAlert` already calls it, so M7
 * only needs to replace the body. It must never throw: alerts must not be able
 * to break the watcher (AGENTS.md hard rule 9).
 */
export async function notifyOwner(_alert: AlertInput): Promise<void> {
  // No-op until M7.
}
