import mongoose, { Schema, type Document } from 'mongoose';
import type { CefrLevel, GoalType } from '@webenglish/shared';

export interface IMediaSegment {
  index: number;
  speaker?: string;
  startSec: number;
  endSec: number;
  textEn: string;
  textVi: string;
  keyPhrase?: string;
}

export interface IMediaStudyGuide {
  summaryVi: string;
  patterns: { formula: string; meaningVi: string; exampleEn: string }[];
  usefulPhrases: string[];
  mindmapBranches: { label: string; items: string[] }[];
  quizItems: { id: string; question: string; options: string[]; answer: string }[];
  speakingPromptVi: string;
}

export interface IPracticeMediaLesson extends Document {
  slug: string;
  title: string;
  titleVi: string;
  topic: string;
  cefrLevel: CefrLevel;
  goalType: GoalType;
  durationSec: number;
  mediaType: 'mp4' | 'youtube' | 'speech';
  mediaUrl?: string;
  youtubeId?: string;
  sourceName: string;
  sourceUrl: string;
  licenseNote?: string;
  isSystem: boolean;
  ownerUserId?: mongoose.Types.ObjectId;
  segments: IMediaSegment[];
  studyGuide?: IMediaStudyGuide;
  isPublished: boolean;
}

const practiceMediaLessonSchema = new Schema<IPracticeMediaLesson>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true },
    titleVi: { type: String, required: true },
    topic: { type: String, required: true },
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
    durationSec: { type: Number, default: 60 },
    mediaType: { type: String, enum: ['mp4', 'youtube', 'speech'], default: 'speech' },
    mediaUrl: { type: String },
    youtubeId: { type: String },
    sourceName: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    licenseNote: { type: String },
    isSystem: { type: Boolean, default: true, index: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    segments: {
      type: [
        {
          index: { type: Number, required: true },
          speaker: { type: String },
          startSec: { type: Number, required: true },
          endSec: { type: Number, required: true },
          textEn: { type: String, required: true },
          textVi: { type: String, required: true },
          keyPhrase: { type: String },
        },
      ],
      default: [],
    },
    studyGuide: {
      summaryVi: { type: String },
      patterns: {
        type: [
          {
            formula: { type: String, required: true },
            meaningVi: { type: String, required: true },
            exampleEn: { type: String, required: true },
          },
        ],
        default: [],
      },
      usefulPhrases: { type: [String], default: [] },
      mindmapBranches: {
        type: [
          {
            label: { type: String, required: true },
            items: { type: [String], default: [] },
          },
        ],
        default: [],
      },
      quizItems: {
        type: [
          {
            id: { type: String, required: true },
            question: { type: String, required: true },
            options: { type: [String], default: [] },
            answer: { type: String, required: true },
          },
        ],
        default: [],
      },
      speakingPromptVi: { type: String },
    },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const PracticeMediaLesson = mongoose.model<IPracticeMediaLesson>(
  'PracticeMediaLesson',
  practiceMediaLessonSchema,
);
