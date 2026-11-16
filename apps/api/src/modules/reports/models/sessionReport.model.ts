import mongoose, { Schema, type Document } from 'mongoose';
import type { SkillScores } from '@webenglish/shared';

export interface IReportVocabItem {
  term: string;
  correction: string;
  contextNote?: string;
}

export interface ISessionReport extends Document {
  sessionId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  nextFocus?: string;
  homeworkSuggestion?: string;
  skillRatings?: Partial<SkillScores>;
  vocabItems: IReportVocabItem[];
  submittedAt: Date;
  dueAt: Date;
  submittedOnTime: boolean;
  lastEditedAt?: Date;
}

const sessionReportSchema = new Schema<ISessionReport>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true, unique: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    summary: { type: String, required: true },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    nextFocus: { type: String },
    homeworkSuggestion: { type: String },
    skillRatings: {
      listening: { type: Number },
      speaking: { type: Number },
      reading: { type: Number },
      writing: { type: Number },
      vocabulary: { type: Number },
      grammar: { type: Number },
      pronunciation: { type: Number },
    },
    vocabItems: {
      type: [
        {
          term: { type: String, required: true },
          correction: { type: String, required: true },
          contextNote: { type: String },
        },
      ],
      default: [],
    },
    submittedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    submittedOnTime: { type: Boolean, required: true, index: true },
    lastEditedAt: { type: Date },
  },
  { timestamps: true },
);

sessionReportSchema.index({ studentId: 1, submittedAt: -1 });
sessionReportSchema.index({ teacherId: 1, submittedAt: -1 });

export const SessionReport = mongoose.model<ISessionReport>('SessionReport', sessionReportSchema);
