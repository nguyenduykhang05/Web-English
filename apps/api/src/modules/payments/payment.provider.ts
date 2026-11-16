import { createHmac, timingSafeEqual } from 'crypto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { env } from '../../config/env.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export type PaymentProviderKind = 'manual_bank_transfer' | 'mock' | 'vnpay_sandbox';

export interface PaymentInitRequest {
  invoiceCode: string;
  amountVnd: number;
  studentName: string;
  clientIp?: string;
}

export interface PaymentInitResult {
  provider: PaymentProviderKind;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  transferNote: string;
  vietQrImageUrl?: string;
  checkoutUrl?: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderKind;
  initiatePayment(input: PaymentInitRequest): Promise<PaymentInitResult>;
}

const DEFAULT_BANK_NAME = 'Techcombank (TCB)';
const DEFAULT_BANK_BIN = '970407';
const DEFAULT_ACCOUNT_NUMBER = '19038821445018';
const DEFAULT_ACCOUNT_HOLDER = 'CONG TY CO PHAN WEBENGLISH';

export class ManualBankTransferProvider implements PaymentProvider {
  readonly name = 'manual_bank_transfer' as const;

  async initiatePayment(input: PaymentInitRequest): Promise<PaymentInitResult> {
    const cleanName = input.studentName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, '')
      .trim()
      .toUpperCase()
      .slice(0, 24);
    const transferNote = `${input.invoiceCode} ${cleanName}`.trim();
    const vietQrImageUrl = `https://img.vietqr.io/image/${DEFAULT_BANK_BIN}-${DEFAULT_ACCOUNT_NUMBER}-compact2.png?amount=${input.amountVnd}&addInfo=${encodeURIComponent(transferNote)}&accountName=${encodeURIComponent(DEFAULT_ACCOUNT_HOLDER)}`;

    return {
      provider: 'manual_bank_transfer',
      bankName: DEFAULT_BANK_NAME,
      accountNumber: '1903 8821 4450 18',
      accountHolder: DEFAULT_ACCOUNT_HOLDER,
      transferNote,
      vietQrImageUrl,
    };
  }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  async initiatePayment(input: PaymentInitRequest): Promise<PaymentInitResult> {
    return {
      provider: 'mock',
      bankName: 'Mock Demo Bank',
      accountNumber: '0000 1111 2222 33',
      accountHolder: 'WEBENGLISH OFFLINE DEMO',
      transferNote: input.invoiceCode,
      vietQrImageUrl: `mock://vietqr/${input.invoiceCode}?amount=${input.amountVnd}`,
    };
  }
}

export function buildVnpaySortedQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
}

export function signVnpayParams(params: Record<string, string>, secret = env.VNPAY_HASH_SECRET): string {
  const signData = buildVnpaySortedQuery(params);
  return createHmac('sha512', secret).update(Buffer.from(signData, 'utf-8')).digest('hex');
}

export function verifyVnpaySignature(
  rawParams: Record<string, unknown>,
  secret = env.VNPAY_HASH_SECRET,
): boolean {
  const receivedHash = typeof rawParams.vnp_SecureHash === 'string' ? rawParams.vnp_SecureHash : '';
  if (!receivedHash) return false;

  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (
      k.startsWith('vnp_') &&
      k !== 'vnp_SecureHash' &&
      k !== 'vnp_SecureHashType' &&
      typeof v === 'string'
    ) {
      filtered[k] = v;
    }
  }
  const expectedHash = signVnpayParams(filtered, secret);
  const a = Buffer.from(receivedHash.toLowerCase(), 'utf-8');
  const b = Buffer.from(expectedHash.toLowerCase(), 'utf-8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export class VNPaySandboxPaymentProvider implements PaymentProvider {
  readonly name = 'vnpay_sandbox' as const;

  async initiatePayment(input: PaymentInitRequest): Promise<PaymentInitResult> {
    const nowVn = dayjs().tz('Asia/Ho_Chi_Minh');
    const vnpParams: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: env.VNPAY_TMN_CODE,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.invoiceCode,
      vnp_OrderInfo: `Thanh toan goi hoc WebEnglish ${input.invoiceCode}`,
      vnp_OrderType: 'other',
      vnp_Amount: String(Math.round(input.amountVnd * 100)),
      vnp_ReturnUrl: env.VNPAY_RETURN_URL,
      vnp_IpAddr: input.clientIp || '127.0.0.1',
      vnp_CreateDate: nowVn.format('YYYYMMDDHHmmss'),
      vnp_ExpireDate: nowVn.add(15, 'minute').format('YYYYMMDDHHmmss'),
    };

    const query = buildVnpaySortedQuery(vnpParams);
    const secureHash = signVnpayParams(vnpParams);
    const checkoutUrl = `${env.VNPAY_URL}?${query}&vnp_SecureHash=${secureHash}`;

    return {
      provider: 'vnpay_sandbox',
      bankName: 'VNPay Sandbox Gateway',
      accountNumber: env.VNPAY_TMN_CODE,
      accountHolder: 'VNPAY SANDBOX',
      transferNote: input.invoiceCode,
      checkoutUrl,
    };
  }
}

const manualProvider = new ManualBankTransferProvider();
const mockProvider = new MockPaymentProvider();
const vnpayProvider = new VNPaySandboxPaymentProvider();

export function getPaymentProvider(requested?: PaymentProviderKind): PaymentProvider {
  const mode = requested ?? env.PAYMENT_PROVIDER;
  if (mode === 'vnpay_sandbox') return vnpayProvider;
  if (mode === 'mock') return mockProvider;
  return manualProvider;
}
