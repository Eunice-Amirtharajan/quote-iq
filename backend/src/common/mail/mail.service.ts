import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    const port = Number.parseInt(process.env.MAIL_PORT ?? '', 10);
    if (
      !process.env.MAIL_HOST ||
      Number.isNaN(port) ||
      !process.env.MAIL_USER ||
      !process.env.MAIL_PASS
    ) {
      this.logger.warn(
        'MAIL_* env vars are incomplete — email delivery will fail',
      );
    }
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number.isNaN(port) ? 2525 : port,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  sendMail(to: string, subject: string, html: string): void {
    this.transporter
      .sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject,
        html,
      })
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to send email to ${to}`,
          err instanceof Error ? err.stack : String(err),
        ),
      );
  }
}
