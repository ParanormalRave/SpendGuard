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
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const c = loadConfig();
  const resendKey = c.resendApiKey?.trim();
  if (resendKey) {
    if (!c.emailFrom) throw new Error("Email not configured");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: c.emailFrom, to: [to], subject, html }),
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("The email provider only allows sending to the account owner until a domain is verified");
        }
        const err = new Error(`Email service is unreachable from this server`) as Error & { code: string };
        err.code = `HTTP_${res.status}`;
        throw err;
      }
    } catch (e) {
      if (e instanceof Error && e.message === "The email provider only allows sending to the account owner until a domain is verified") {
        throw e;
      }
      if ((e as { name?: string })?.name === "AbortError") {
        const te = new Error("Email service is unreachable from this server") as Error & { code: string };
        te.code = "ETIMEDOUT";
        throw te;
      }
      // Ensure code is set for logging without leaking key
      if (e instanceof Error && !(e as { code?: string }).code) {
        (e as { code?: string }).code = (e as { code?: string }).code ?? "UNKNOWN";
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
    return;
  }

  const transport = getTransport();
  if (!transport) throw new Error("Email not configured");
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
