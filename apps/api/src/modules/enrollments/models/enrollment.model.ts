import mongoose, { Schema, type Document } from 'mongoose';
import type { EnrollmentStatus } from '@webenglish/shared';

/**
 * NOTE (AGENTS.md #2): remainingSessions is intentionally NOT stored here.
 * Always aggregate remaining session balance from SessionLedger.
 */
export interface IEnrollment extends Document {
  studentId: mongoose.Types.ObjectId;
  teacherId?: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  couponCode?: string;
  status: EnrollmentStatus;
  purchasedSessions: number;
  durationMinutes: number;
  validityDays: number;
  activatedAt?: Date;
  expiresAt?: Date;
  freezeUntil?: Date;
  frozenDaysTotal: number;
  notes?: string;
  bookingLockSeq: number;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    packageId: { type: Schema.Types.ObjectId, ref: 'CoursePackage', required: true },
    couponCode: { type: String },
    status: {
      type: String,
      enum: ['pending_payment', 'active', 'paused', 'completed', 'churned'],
      default: 'pending_payment',
      index: true,
    },
    purchasedSessions: { type: Number, required: true, min: 1 },
    durationMinutes: { type: Number, required: true, default: 50 },
    validityDays: { type: Number, required: true, default: 120 },
    activatedAt: { type: Date },
    expiresAt: { type: Date },
    freezeUntil: { type: Date },
    frozenDaysTotal: { type: Number, default: 0, min: 0 },
    notes: { type: String },
    bookingLockSeq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

enrollmentSchema.index({ studentId: 1, status: 1 });
enrollmentSchema.index({ teacherId: 1, status: 1 });

export const Enrollment = mongoose.model<IEnrollment>('Enrollment', enrollmentSchema);
