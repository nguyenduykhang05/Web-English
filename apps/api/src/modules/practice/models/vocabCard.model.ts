import mongoose, { Schema, type Document } from 'mongoose';
import type { CefrLevel } from '@webenglish/shared';

export interface IVocabCard extends Document {
  deckId: mongoose.Types.ObjectId;
  term: string;
  ipa: string;
  partOfSpeech: string;
  meaningVi: string;
  definitionEn?: string;
  exampleEn?: string;
  audioUrl?: string;
  contextNote?: string;
  cefrLevel: CefrLevel;
  sourceSessionId?: mongoose.Types.ObjectId;
}

const vocabCardSchema = new Schema<IVocabCard>(
  {
    deckId: { type: Schema.Types.ObjectId, ref: 'VocabDeck', required: true, index: true },
    term: { type: String, required: true, trim: true },
    ipa: { type: String, default: '' },
    partOfSpeech: { type: String, default: 'phrase' },
    meaningVi: { type: String, required: true },
    definitionEn: { type: String },
    exampleEn: { type: String },
    audioUrl: { type: String },
    contextNote: { type: String },
    cefrLevel: {
      type: String,
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      default: 'B1',
    },
    sourceSessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
  },
  { timestamps: true },
);

vocabCardSchema.index({ deckId: 1, term: 1 }, { unique: true });

export const VocabCard = mongoose.model<IVocabCard>('VocabCard', vocabCardSchema);
