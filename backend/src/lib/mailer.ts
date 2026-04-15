import nodemailer, { Transporter } from "nodemailer";
import { logger } from "./logger";

const smtpUrl = process.env.SMTP_URL;
const from = process.env.MAIL_FROM ?? "TestSuits <no-reply@testsuits.local>";
export const appUrl = process.env.APP_URL ?? "http://localhost:5173";

let transporter: Transporter | null = null;
if (smtpUrl) {
  transporter = nodemailer.createTransport(smtpUrl);
  logger.info({ smtpUrl: smtpUrl.replace(/\/\/[^@]*@/, "//***@") }, "mailer initialised");
} else {
  logger.warn("SMTP_URL not set — outgoing email will be logged only, not sent");
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
