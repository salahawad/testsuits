import nodemailer, { Transporter } from "nodemailer";
import { logger } from "./logger";

const gmailUser = process.env.GMAIL_USER?.trim();
const gmailPassword = process.env.GMAIL_PASSWORD?.trim();
const smtpUrl = process.env.SMTP_URL;
const from =
  process.env.MAIL_FROM ??
  (gmailUser ? `TestSuits <${gmailUser}>` : "TestSuits <no-reply@testsuits.local>");
export const appUrl = process.env.APP_URL ?? "http://localhost:5173";

let transporter: Transporter | null = null;
if (gmailUser && gmailPassword) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPassword },
  });
  logger.info({ gmailUser }, "mailer initialised (Gmail)");
} else if (smtpUrl) {
  transporter = nodemailer.createTransport(smtpUrl);
  logger.info({ smtpUrl: smtpUrl.replace(/\/\/[^@]*@/, "//***@") }, "mailer initialised (SMTP)");
} else {
  logger.warn("No mail transport configured — outgoing email will be logged only, not sent");
}

export type Mail = { to: string; subject: string; text: string; html?: string };

export async function sendEmail(mail: Mail): Promise<void> {
  if (!transporter) {
    logger.info({ to: mail.to, subject: mail.subject, preview: mail.text.slice(0, 200) }, "email not sent (no SMTP)");
    return;
  }
  try {
    const info = await transporter.sendMail({ from, ...mail });
    logger.info({ to: mail.to, subject: mail.subject, messageId: info.messageId }, "email sent");
  } catch (e: any) {
    logger.error({ err: e.message, to: mail.to, subject: mail.subject }, "email send failed");
  }
}
