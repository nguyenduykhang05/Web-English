import mongoose, { Schema, type Document } from 'mongoose';
import type { AlertStatus } from '@webenglish/shared';

export type QualityAlertType =
  | 'no_show_teacher'
  | 'report_overdue'
  | 'low_rating'
  | 'late_cancel_teacher';

export interface IQualityAlert extends Document {
  type: QualityAlertType;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  teacherId?: mongoose.Types.ObjectId;
  studentId?: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  dedupeKey?: string;
  status: AlertStatus;
  handledBy?: mongoose.Types.ObjectId;
  handledAt?: Date;
  resolutionNote?: string;
}

const qualityAlertSchema = new Schema<IQualityAlert>(
  {
    type: {
      type: String,
      enum: ['no_show_teacher', 'report_overdue', 'low_rating', 'late_cancel_teacher'],
      required: true,
      index: true,
    },
    severity: { type: String, enum: ['high', 'medium'], required: true },
    title: { type: String, required: true },
    detail: { type: String, required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User' },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    dedupeKey: { type: String },
    status: { type: String, enum: ['open', 'ack', 'resolved'], default: 'open', index: true },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    handledAt: { type: Date },
    resolutionNote: { type: String },
  },
  { timestamps: true },
);

qualityAlertSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $exists: true } } },
);
qualityAlertSchema.index({ status: 1, createdAt: -1 });

export const QualityAlert = mongoose.model<IQualityAlert>('QualityAlert', qualityAlertSchema);
