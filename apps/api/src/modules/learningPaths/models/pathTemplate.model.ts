import mongoose, { Schema, type Document } from 'mongoose';
import type { CefrLevel, GoalType, SkillKey } from '@webenglish/shared';

export interface ITemplateMilestone {
  title: string;
  description: string;
  cefrTarget: CefrLevel;
  skillFocus: SkillKey;
  plannedSessions: number;
}

export interface IPathTemplate extends Document {
  code: string;
  title: string;
  goalType: GoalType;
  targetCefr: CefrLevel;
  milestones: ITemplateMilestone[];
  isActive: boolean;
}

const pathTemplateSchema = new Schema<IPathTemplate>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true },
    goalType: {
      type: String,
      enum: ['ielts', 'toeic', 'communication', 'business', 'kids', 'interview', 'other'],
      required: true,
      index: true,
    },
    targetCefr: {
      type: String,
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      required: true,
    },
    milestones: {
      type: [
        {
          title: { type: String, required: true },
          description: { type: String, default: '' },
          cefrTarget: {
            type: String,
            enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
            required: true,
          },
          skillFocus: {
            type: String,
            enum: ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar', 'pronunciation'],
            required: true,
          },
          plannedSessions: { type: Number, required: true, min: 1 },
        },
      ],
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const PathTemplate = mongoose.model<IPathTemplate>('PathTemplate', pathTemplateSchema);
