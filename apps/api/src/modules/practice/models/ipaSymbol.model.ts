import mongoose, { Schema, type Document } from 'mongoose';

export interface IIpaExample {
  word: string;
  highlightPart: string;
  ipa: string;
  meaningVi: string;
}

export interface IIpaSymbol extends Document {
  number: number;
  symbol: string;
  category: 'monophthong' | 'diphthong' | 'consonant';
  voicing: 'vowel' | 'voiced' | 'unvoiced';
  nameVi: string;
  articulationTipVi: string;
  vietnamesePitfallVi: string;
  spellingPatterns: string[];
  confusingPairSymbol?: string;
  examples: IIpaExample[];
  sampleSentence: {
    textEn: string;
    textVi: string;
    targetWord: string;
  };
}

const ipaSymbolSchema = new Schema<IIpaSymbol>(
  {
    number: { type: Number, required: true, unique: true },
    symbol: { type: String, required: true, unique: true },
    category: { type: String, enum: ['monophthong', 'diphthong', 'consonant'], required: true },
    voicing: { type: String, enum: ['vowel', 'voiced', 'unvoiced'], required: true },
    nameVi: { type: String, required: true },
    articulationTipVi: { type: String, required: true },
    vietnamesePitfallVi: { type: String, required: true },
    spellingPatterns: { type: [String], default: [] },
    confusingPairSymbol: { type: String },
    examples: {
      type: [
        {
          word: { type: String, required: true },
          highlightPart: { type: String, required: true },
          ipa: { type: String, required: true },
          meaningVi: { type: String, required: true },
        },
      ],
      default: [],
    },
    sampleSentence: {
      textEn: { type: String, required: true },
      textVi: { type: String, required: true },
      targetWord: { type: String, required: true },
    },
  },
  { timestamps: true },
);

export const IpaSymbol = mongoose.model<IIpaSymbol>('IpaSymbol', ipaSymbolSchema);
