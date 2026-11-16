import mongoose, { Schema, type Document } from 'mongoose';
import type { SrsRating } from '@webenglish/shared';

export interface IUserVocabProgress extends Document {
  studentId: mongoose.Types.ObjectId;
  cardId: mongoose.Types.ObjectId;
  deckId: mongoose.Types.ObjectId;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: Date;
  lastReviewedAt?: Date;
  lastRating?: SrsRating;
  lapses: number;
  starred: boolean;
  totalReviews: number;
  correctReviews: number;
}

const userVocabProgressSchema = new Schema<IUserVocabProgress>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cardId: { type: Schema.Types.ObjectId, ref: 'VocabCard', required: true, index: true },
    deckId: { type: Schema.Types.ObjectId, ref: 'VocabDeck', required: true, index: true },
    repetitions: { type: Number, default: 0 },
    intervalDays: { type: Number, default: 0 },
    easeFactor: { type: Number, default: 2.5 },
    dueAt: { type: Date, default: () => new Date(), index: true },
    lastReviewedAt: { type: Date },
    lastRating: { type: String, enum: ['again', 'hard', 'good', 'easy'] },
    lapses: { type: Number, default: 0 },
    starred: { type: Boolean, default: false, index: true },
    totalReviews: { type: Number, default: 0 },
    correctReviews: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userVocabProgressSchema.index({ studentId: 1, cardId: 1 }, { unique: true });
userVocabProgressSchema.index({ studentId: 1, dueAt: 1 });

export const UserVocabProgress = mongoose.model<IUserVocabProgress>(
  'UserVocabProgress',
  userVocabProgressSchema,
);
