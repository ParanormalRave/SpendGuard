import type { AlertInput } from "../db";
import { getDb, getUserByWallet } from "../db";
import { buildAlertEmail, sendEmail } from "./email";

const RANK: Record<string, number> = { info: 0, warning: 1, critical: 2 };

export async function notifyOwner(alert: AlertInput): Promise<void> {
  try {
    const user = getUserByWallet(getDb(), alert.owner);
    if (!user) return;
    if (!user.email_enabled) return;
    const min = (user.min_severity as string) || "warning";
    const alertRank = RANK[alert.severity] ?? 0;
    const minRank = RANK[min] ?? 1;
    if (alertRank < minRank) return;
    const { subject, html } = buildAlertEmail(alert as unknown as Parameters<typeof buildAlertEmail>[0]);
    await sendEmail(user.email, subject, html);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Never log full email
    console.error(`[notify] failed for owner ${alert.owner.slice(0, 4)}…: ${msg.replace(/([?&]api-key=)[^&\s]+/gi, "$1***")}`);
  }
}

export { buildAlertEmail, sendEmail } from "./email";
