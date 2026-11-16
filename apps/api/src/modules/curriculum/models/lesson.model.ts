import mongoose, { Schema, type Document } from 'mongoose';
import type { CefrLevel, GoalType, SkillKey } from '@webenglish/shared';

export interface ILesson extends Document {
  slug: string;
  title: string;
  description: string;
  goalType: GoalType;
  cefrLevel: CefrLevel;
  skillFocus: SkillKey;
  durationMinutes: number;
  contentMarkdown: string;
  sourceName?: string;
  sourceUrl?: string;
  isPublished: boolean;
  createdBy?: mongoose.Types.ObjectId;
}

const lessonSchema = new Schema<ILesson>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    goalType: {
      type: String,
      enum: ['ielts', 'toeic', 'communication', 'business', 'kids', 'interview', 'other'],
      required: true,
      index: true,
    },
    cefrLevel: {
      type: String,
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      required: true,
      index: true,
    },
    skillFocus: {
      type: String,
      enum: ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar', 'pronunciation'],
      required: true,
      index: true,
    },
    durationMinutes: { type: Number, default: 45 },
    contentMarkdown: { type: String, required: true },
    sourceName: { type: String },
    sourceUrl: { type: String },
    isPublished: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Lesson = mongoose.model<ILesson>('Lesson', lessonSchema);
