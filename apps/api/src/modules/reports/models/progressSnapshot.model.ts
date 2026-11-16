import mongoose, { Schema, type Document } from 'mongoose';
import type { CefrLevel, SkillScores } from '@webenglish/shared';

export interface IProgressSnapshot extends Document {
  studentId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  source: 'report' | 'assessment' | 'manual';
  cefrLevel: CefrLevel;
  overallScore: number;
  skillScores: SkillScores;
  capturedAt: Date;
}

const progressSnapshotSchema = new Schema<IProgressSnapshot>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    source: { type: String, enum: ['report', 'assessment', 'manual'], default: 'report' },
    cefrLevel: { type: String, enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], required: true },
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    skillScores: {
      listening: { type: Number, required: true },
      speaking: { type: Number, required: true },
      reading: { type: Number, required: true },
      writing: { type: Number, required: true },
      vocabulary: { type: Number, required: true },
      grammar: { type: Number, required: true },
      pronunciation: { type: Number, required: true },
    },
    capturedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

progressSnapshotSchema.index({ studentId: 1, capturedAt: -1 });

export const ProgressSnapshot = mongoose.model<IProgressSnapshot>(
  'ProgressSnapshot',
  progressSnapshotSchema,
);
