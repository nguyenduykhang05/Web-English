import mongoose, { Schema, type Document } from 'mongoose';
import type { PracticeMediaMode } from '@webenglish/shared';

export interface IWordDiffItem {
  expected: string;
  actual?: string;
  status: 'exact' | 'wrong' | 'missing' | 'extra';
}

export interface IPracticeAttempt extends Document {
  studentId: mongoose.Types.ObjectId;
  lessonId: mongoose.Types.ObjectId;
  segmentIndex: number;
  mode: PracticeMediaMode;
  typedText?: string;
  spokenTranscript?: string;
  audioUrl?: string;
  autoScore: number;
  accuracyPct: number;
  fluencyPct?: number;
  completenessPct: number;
  wordDiffs: IWordDiffItem[];
  proposedStatus: 'proposed' | 'approved' | 'needs_retry';
  teacherFeedback?: string;
  verifiedScore?: number;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
}

const practiceAttemptSchema = new Schema<IPracticeAttempt>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lessonId: {
      type: Schema.Types.ObjectId,
      ref: 'PracticeMediaLesson',
      required: true,
      index: true,
    },
    segmentIndex: { type: Number, required: true },
    mode: { type: String, enum: ['dictation', 'shadowing'], required: true, index: true },
    typedText: { type: String },
    spokenTranscript: { type: String },
    audioUrl: { type: String },
    autoScore: { type: Number, required: true },
    accuracyPct: { type: Number, required: true },
    fluencyPct: { type: Number },
    completenessPct: { type: Number, required: true },
    wordDiffs: {
      type: [
        {
          expected: { type: String, required: true },
          actual: { type: String },
          status: { type: String, enum: ['exact', 'wrong', 'missing', 'extra'], required: true },
        },
      ],
      default: [],
    },
    proposedStatus: {
      type: String,
      enum: ['proposed', 'approved', 'needs_retry'],
      default: 'proposed',
      index: true,
    },
    teacherFeedback: { type: String },
    verifiedScore: { type: Number },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

practiceAttemptSchema.index({ studentId: 1, lessonId: 1, createdAt: -1 });

export const PracticeAttempt = mongoose.model<IPracticeAttempt>(
  'PracticeAttempt',
  practiceAttemptSchema,
);
