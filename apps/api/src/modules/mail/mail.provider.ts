import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailSendResult {
  delivered: boolean;
  provider: 'smtp' | 'mock';
  messageId?: string;
}

export interface MailProvider {
  sendMail(message: MailMessage): Promise<MailSendResult>;
}

export interface CapturedMail extends MailMessage {
  sentAt: string;
  messageId: string;
}

export class MockMailProvider implements MailProvider {
  private readonly outbox: CapturedMail[] = [];

  async sendMail(message: MailMessage): Promise<MailSendResult> {
    const messageId = `mock-${Date.now()}-${this.outbox.length + 1}`;
    this.outbox.push({
      ...message,
      sentAt: new Date().toISOString(),
      messageId,
    });
    return { delivered: true, provider: 'mock', messageId };
  }

  getOutbox(): readonly CapturedMail[] {
    return this.outbox;
  }

  clearOutbox(): void {
    this.outbox.length = 0;
  }
}

export class SmtpMailProvider implements MailProvider {
  private readonly transporter = nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: false,
    auth: env.MAIL_USER ? { user: env.MAIL_USER, pass: env.MAIL_PASS } : undefined,
  });

  async sendMail(message: MailMessage): Promise<MailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: env.APP_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { delivered: true, provider: 'smtp', messageId: info.messageId };
    } catch {
      return { delivered: false, provider: 'smtp' };
    }
  }
}

export const mockMailProvider = new MockMailProvider();
const smtpMailProvider = new SmtpMailProvider();

export function getMailProvider(): MailProvider {
  return env.MAIL_PROVIDER === 'mock' ? mockMailProvider : smtpMailProvider;
}
