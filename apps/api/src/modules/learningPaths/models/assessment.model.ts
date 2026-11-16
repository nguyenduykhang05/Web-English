import mongoose, { Schema, type Document } from 'mongoose';
import type { AssessmentType, CefrLevel, SkillKey, SkillScores } from '@webenglish/shared';

export interface IAssessmentAnswer {
  questionId: string;
  level: CefrLevel;
  skill: SkillKey;
  selectedIndex: number;
  correct: boolean;
  answeredAt: Date;
}

export interface IAssessment extends Document {
  studentId: mongoose.Types.ObjectId;
  type: AssessmentType;
  status: 'in_progress' | 'completed';
  currentLevel: CefrLevel;
  maxQuestions: number;
  askedQuestionIds: string[];
  answers: IAssessmentAnswer[];
  overallScore?: number;
  cefrResult?: CefrLevel;
  skillScores?: SkillScores;
  completedAt?: Date;
}

const assessmentSchema = new Schema<IAssessment>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['placement', 'progress', 'final'], default: 'placement' },
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress', index: true },
    currentLevel: {
      type: String,
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      default: 'B1',
    },
    maxQuestions: { type: Number, default: 6 },
    askedQuestionIds: { type: [String], default: [] },
    answers: {
      type: [
        {
          questionId: { type: String, required: true },
          level: { type: String, enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], required: true },
          skill: {
            type: String,
            enum: ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar', 'pronunciation'],
            required: true,
          },
          selectedIndex: { type: Number, required: true },
          correct: { type: Boolean, required: true },
          answeredAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
    overallScore: { type: Number },
    cefrResult: { type: String, enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
    skillScores: {
      listening: { type: Number },
      speaking: { type: Number },
      reading: { type: Number },
      writing: { type: Number },
      vocabulary: { type: Number },
      grammar: { type: Number },
      pronunciation: { type: Number },
    },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

export const Assessment = mongoose.model<IAssessment>('Assessment', assessmentSchema);
