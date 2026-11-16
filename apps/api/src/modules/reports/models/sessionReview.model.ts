import mongoose, { Schema, type Document } from 'mongoose';

export interface ISessionReview extends Document {
  sessionId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  rating: number;
  comment?: string;
  tags: string[];
  submittedAt: Date;
}

const sessionReviewSchema = new Schema<ISessionReview>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true, unique: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    tags: { type: [String], default: [] },
    submittedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

sessionReviewSchema.index({ teacherId: 1, submittedAt: -1 });

export const SessionReview = mongoose.model<ISessionReview>('SessionReview', sessionReviewSchema);
