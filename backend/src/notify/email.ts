import nodemailer from "nodemailer";
import { loadConfig } from "../config";

function getTransport(): ReturnType<typeof nodemailer.createTransport> | null {
  const c = loadConfig();
  if (!c.smtpHost || !c.smtpUser || !c.smtpPass || !c.emailFrom) return null;
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpPort === 465,
    auth: { user: c.smtpUser, pass: c.smtpPass },
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transport = getTransport();
  if (!transport) throw new Error("Email not configured");
  const c = loadConfig();
  await transport.sendMail({ from: c.emailFrom, to, subject, html });
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildAlertEmail(alert: { title: string; message: string; type: string; severity: string; policy: string; txSignature?: string | null; createdAt?: string; data?: Record<string, unknown> }): { subject: string; html: string } {
  const subject = `[SpendGuard] ${alert.severity}: ${alert.title}`;
  const html = `<p>${escape(alert.message)}</p><p>Type: ${escape(alert.type)} Policy: ${escape(alert.policy)}</p>${alert.txSignature ? `<p>Tx: ${escape(alert.txSignature)}</p>` : ""}`;
  return { subject, html };
}
