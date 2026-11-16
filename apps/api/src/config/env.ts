import dotenv from 'dotenv';
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/webenglish',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'change-me',
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? '15m',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? '7d',
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS ?? 12),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  BASE_URL: process.env.BASE_URL ?? 'http://localhost:4000',
  JITSI_DOMAIN: process.env.JITSI_DOMAIN ?? 'meet.jit.si',
  AI_PROVIDER: process.env.AI_PROVIDER ?? 'mock',
  AI_MODEL: process.env.AI_MODEL ?? 'mock',
  AI_API_KEY: process.env.AI_API_KEY ?? 'mock',
  PAYMENT_PROVIDER: (process.env.PAYMENT_PROVIDER ??
    (process.env.NODE_ENV === 'test' ? 'mock' : 'manual_bank_transfer')) as
    | 'mock'
    | 'manual_bank_transfer'
    | 'vnpay_sandbox',
  VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE ?? 'WEBENG01',
  VNPAY_HASH_SECRET: process.env.VNPAY_HASH_SECRET ?? 'WEBENGLISH_SANDBOX_SECRET_KEY_2026',
  VNPAY_URL: process.env.VNPAY_URL ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  VNPAY_RETURN_URL: process.env.VNPAY_RETURN_URL ?? 'http://localhost:5173/student/billing',
  MAIL_HOST: process.env.MAIL_HOST ?? 'localhost',
  MAIL_PORT: Number(process.env.MAIL_PORT ?? 1025),
  MAIL_USER: process.env.MAIL_USER ?? '',
  MAIL_PASS: process.env.MAIL_PASS ?? '',
  MAIL_PROVIDER: (process.env.MAIL_PROVIDER ?? (process.env.NODE_ENV === 'test' ? 'mock' : 'smtp')) as 'smtp' | 'mock',
  APP_FROM: process.env.APP_FROM ?? 'no-reply@webenglish.local',
  WEB_URL: process.env.WEB_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173'
};
