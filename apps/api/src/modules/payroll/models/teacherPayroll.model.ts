import mongoose, { Schema, type Document } from 'mongoose';

export type PayrollStatus = 'draft' | 'approved' | 'paid';

export interface IPayrollLineItem {
  sessionId: mongoose.Types.ObjectId;
  startAt: Date;
  sessionStatus: string;
  studentName: string;
  amountVnd: number;
}

export interface ITeacherPayroll extends Document {
  month: string;
  teacherId: mongoose.Types.ObjectId;
  completedSessionsCount: number;
  noShowStudentSessionsCount: number;
  noShowTeacherSessionsCount: number;
  ratePerSessionVnd: number;
  grossVnd: number;
  bonusVnd: number;
  deductionVnd: number;
  netVnd: number;
  lineItems: IPayrollLineItem[];
  status: PayrollStatus;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  paidAt?: Date;
  notes?: string;
}

const teacherPayrollSchema = new Schema<ITeacherPayroll>(
  {
    month: { type: String, required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    completedSessionsCount: { type: Number, required: true, default: 0 },
    noShowStudentSessionsCount: { type: Number, required: true, default: 0 },
    noShowTeacherSessionsCount: { type: Number, required: true, default: 0 },
    ratePerSessionVnd: { type: Number, required: true, min: 0 },
    grossVnd: { type: Number, required: true, min: 0 },
    bonusVnd: { type: Number, required: true, default: 0, min: 0 },
    deductionVnd: { type: Number, required: true, default: 0, min: 0 },
    netVnd: { type: Number, required: true, min: 0 },
    lineItems: {
      type: [
        {
          sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
          startAt: { type: Date, required: true },
          sessionStatus: { type: String, required: true },
          studentName: { type: String, required: true },
          amountVnd: { type: Number, required: true },
        },
      ],
      default: [],
    },
    status: { type: String, enum: ['draft', 'approved', 'paid'], default: 'draft', index: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    paidAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true },
);

teacherPayrollSchema.index({ month: 1, teacherId: 1 }, { unique: true });

export const TeacherPayroll = mongoose.model<ITeacherPayroll>(
  'TeacherPayroll',
  teacherPayrollSchema,
);
