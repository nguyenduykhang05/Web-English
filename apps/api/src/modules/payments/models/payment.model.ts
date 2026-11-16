import mongoose, { Schema, type Document } from 'mongoose';
import type { PaymentStatus } from '@webenglish/shared';

export interface IPayment extends Document {
  invoiceId: mongoose.Types.ObjectId;
  enrollmentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  provider: 'manual_bank_transfer' | 'mock' | 'vnpay_sandbox';
  amountVnd: number;
  status: PaymentStatus;
  transactionRef?: string;
  paymentMeta: {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
    transferNote?: string;
    vietQrImageUrl?: string;
    checkoutUrl?: string;
  };
  confirmedBy?: mongoose.Types.ObjectId;
  confirmedAt?: Date;
  notes?: string;
}

const paymentSchema = new Schema<IPayment>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: {
      type: String,
      enum: ['manual_bank_transfer', 'mock', 'vnpay_sandbox'],
      default: 'manual_bank_transfer',
    },
    amountVnd: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    transactionRef: { type: String },
    paymentMeta: {
      bankName: { type: String },
      accountNumber: { type: String },
      accountHolder: { type: String },
      transferNote: { type: String },
      vietQrImageUrl: { type: String },
      checkoutUrl: { type: String },
    },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true },
);

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
