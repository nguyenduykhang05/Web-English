import mongoose, { Schema, type Document } from 'mongoose';
import type { InvoiceStatus } from '@webenglish/shared';

export interface IInvoice extends Document {
  invoiceCode: string;
  enrollmentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  couponCode?: string;
  status: InvoiceStatus;
  paidAt?: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceCode: { type: String, required: true, unique: true, index: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: Schema.Types.ObjectId, ref: 'CoursePackage', required: true },
    subtotalVnd: { type: Number, required: true, min: 0 },
    discountVnd: { type: Number, required: true, default: 0, min: 0 },
    totalVnd: { type: Number, required: true, min: 0 },
    couponCode: { type: String },
    status: {
      type: String,
      enum: ['unpaid', 'partially_paid', 'paid', 'void', 'refunded'],
      default: 'unpaid',
      index: true,
    },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
