import mongoose, { Schema, type Document } from 'mongoose';
import type { CefrLevel, GoalType, VocabDeckCategory } from '@webenglish/shared';

export interface IVocabDeck extends Document {
  slug: string;
  title: string;
  titleVi: string;
  description: string;
  category: VocabDeckCategory;
  cefrLevel: CefrLevel;
  goalType: GoalType;
  isSystem: boolean;
  ownerStudentId?: mongoose.Types.ObjectId;
  sourceName?: string;
  sourceUrl?: string;
  cardsCount: number;
}

const vocabDeckSchema = new Schema<IVocabDeck>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true },
    titleVi: { type: String, required: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['cefr', 'ielts', 'business', 'communication', 'session_notes'],
      required: true,
      index: true,
    },
    cefrLevel: {
      type: String,
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      required: true,
      index: true,
    },
    goalType: {
      type: String,
      enum: ['ielts', 'toeic', 'communication', 'business', 'kids', 'interview', 'other'],
      required: true,
      index: true,
    },
    isSystem: { type: Boolean, default: true, index: true },
    ownerStudentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    sourceName: { type: String },
    sourceUrl: { type: String },
    cardsCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

vocabDeckSchema.index({ isSystem: 1, category: 1, cefrLevel: 1 });

export const VocabDeck = mongoose.model<IVocabDeck>('VocabDeck', vocabDeckSchema);
