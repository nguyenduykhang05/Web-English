import mongoose, { Schema, type Document } from 'mongoose';
import type { CefrLevel, GoalType } from '@webenglish/shared';

export interface ICourse extends Document {
  slug: string;
  title: string;
  description: string;
  goalType: GoalType;
  targetCefrRange: CefrLevel[];
  syllabusOutline: string[];
  isPublished: boolean;
}

const courseSchema = new Schema<ICourse>(
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
    targetCefrRange: {
      type: [String],
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      default: ['B1', 'B2'],
    },
    syllabusOutline: { type: [String], default: [] },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const Course = mongoose.model<ICourse>('Course', courseSchema);
