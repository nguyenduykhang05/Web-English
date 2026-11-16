import mongoose, { Schema, type Document } from 'mongoose';
import type { LedgerEntryType } from '@webenglish/shared';

/**
 * Single source of truth for student session credit balances.
 * Entries are append-only; balances are computed by aggregating delta.
 */
export interface ISessionLedger extends Document {
  studentId: mongoose.Types.ObjectId;
  enrollmentId: mongoose.Types.ObjectId;
  type: LedgerEntryType;
  delta: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  actorId?: mongoose.Types.ObjectId;
}

const sessionLedgerSchema = new Schema<ISessionLedger>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true, index: true },
    type: {
      type: String,
      enum: [
        'purchase',
        'booking_debit',
        'cancel_refund',
        'makeup_credit',
        'penalty',
        'refund',
        'expire',
        'adjustment',
      ],
      required: true,
      index: true,
    },
    delta: { type: Number, required: true },
    reason: { type: String, required: true },
    referenceType: { type: String },
    referenceId: { type: String },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

sessionLedgerSchema.index({ enrollmentId: 1, createdAt: 1 });
sessionLedgerSchema.index({ studentId: 1, createdAt: -1 });
sessionLedgerSchema.index({ referenceType: 1, referenceId: 1, type: 1 });

export const SessionLedger = mongoose.model<ISessionLedger>(
  'SessionLedger',
  sessionLedgerSchema,
);
