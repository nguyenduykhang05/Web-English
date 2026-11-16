import { env } from '../../config/env.js';
import { getMailProvider, type MailMessage, type MailSendResult } from './mail.provider.js';

export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<MailSendResult> {
  const message: MailMessage = { to, subject, text, html };
  return getMailProvider().sendMail(message);
}

export async function sendVerificationEmail(to: string, fullName: string, rawToken: string) {
  const verifyUrl = `${env.WEB_URL}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  return sendMail(
    to,
    '[WebEnglish] Xác thực địa chỉ email của bạn',
    `Xin chào ${fullName},\n\nVui lòng mở liên kết sau (hiệu lực 24 giờ) để xác thực email:\n${verifyUrl}\n`,
  );
}

export async function sendPasswordResetEmail(to: string, fullName: string, rawToken: string) {
  const resetUrl = `${env.WEB_URL}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
  return sendMail(
    to,
    '[WebEnglish] Đặt lại mật khẩu tài khoản',
    `Xin chào ${fullName},\n\nMở liên kết sau (hiệu lực 1 giờ) để đặt lại mật khẩu:\n${resetUrl}\n`,
  );
}

export async function sendTeacherInviteEmail(to: string, fullName: string, rawToken: string) {
  const inviteUrl = `${env.WEB_URL}/auth/accept-invite?token=${encodeURIComponent(rawToken)}`;
  return sendMail(
    to,
    '[WebEnglish] Lời mời tham gia giảng dạy 1-1',
    `Xin chào ${fullName},\n\nBạn được mời làm giáo viên trên WebEnglish. Vui lòng thiết lập mật khẩu trong vòng 72 giờ tại:\n${inviteUrl}\n`,
  );
}
