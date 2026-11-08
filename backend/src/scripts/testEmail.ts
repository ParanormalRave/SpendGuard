import { sendEmail } from "../notify/email";

const to = process.argv[2];
if (!to) {
  console.error("Usage: yarn tsx src/scripts/testEmail.ts you@example.com");
  process.exit(1);
}
sendEmail(to, "SpendGuard test email", "<p>This is a test email from SpendGuard.</p>")
  .then(() => console.log("Sent"))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
