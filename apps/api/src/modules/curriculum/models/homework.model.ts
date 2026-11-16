import mongoose, { Schema, type Document } from 'mongoose';
import type { HomeworkStatus, HomeworkType, SkillKey } from '@webenglish/shared';

export interface IHomeworkQuestion {
  id: string;
  type: HomeworkType;
  prompt: string;
  options?: string[];
  correctAnswer?: string;
  pairs?: { left: string; right: string }[];
  maxPoints: number;
}

export interface IHomework extends Document {
  studentId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  lessonId?: mongoose.Types.ObjectId;
  title: string;
  homeworkType: HomeworkType;
  skillFocus: SkillKey;
  prompt: string;
  questions: IHomeworkQuestion[];
  maxScore: number;
  status: HomeworkStatus;
  proposedStatus: 'approved' | 'proposed';
  dueAt?: Date;
  submittedNote?: string;
  audioUrl?: string;
  submittedAnswers: { questionId: string; answer: string }[];
  autoSuggestedScore?: number;
  submittedAt?: Date;
  score?: number;
  teacherFeedback?: string;
  gradedBy?: mongoose.Types.ObjectId;
  gradedAt?: Date;
}

const homeworkSchema = new Schema<IHomework>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson' },
    title: { type: String, required: true },
    homeworkType: {
      type: String,
      enum: ['multiple_choice', 'fill_blank', 'matching', 'essay', 'speaking'],
      required: true,
    },
    skillFocus: {
      type: String,
      enum: ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar', 'pronunciation'],
      required: true,
    },
    prompt: { type: String, required: true },
    questions: {
      type: [
        {
          id: { type: String, required: true },
          type: {
            type: String,
            enum: ['multiple_choice', 'fill_blank', 'matching', 'essay', 'speaking'],
            required: true,
          },
          prompt: { type: String, required: true },
          options: { type: [String] },
          correctAnswer: { type: String },
          pairs: {
            type: [{ left: { type: String }, right: { type: String } }],
          },
          maxPoints: { type: Number, default: 10 },
        },
      ],
      default: [],
    },
    maxScore: { type: Number, default: 100 },
    status: {
      type: String,
      enum: ['assigned', 'submitted', 'graded', 'overdue'],
      default: 'assigned',
      index: true,
    },
    proposedStatus: { type: String, enum: ['approved', 'proposed'], default: 'approved' },
    dueAt: { type: Date },
    submittedNote: { type: String },
    audioUrl: { type: String },
    submittedAnswers: {
      type: [{ questionId: { type: String, required: true }, answer: { type: String, required: true } }],
      default: [],
    },
    autoSuggestedScore: { type: Number },
    submittedAt: { type: Date },
    score: { type: Number },
    teacherFeedback: { type: String },
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    gradedAt: { type: Date },
  },
  { timestamps: true },
);

homeworkSchema.index({ studentId: 1, status: 1, createdAt: -1 });
homeworkSchema.index({ teacherId: 1, status: 1, createdAt: -1 });

export const Homework = mongoose.model<IHomework>('Homework', homeworkSchema);
