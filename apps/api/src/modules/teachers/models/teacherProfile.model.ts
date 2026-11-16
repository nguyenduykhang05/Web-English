import mongoose, { Schema, type Document } from 'mongoose';
import type { CefrLevel, GoalType, PreferredSlot } from '@webenglish/shared';

export interface ITeacherException {
  date: string;
  type: 'off' | 'extra';
  startTime?: string;
  endTime?: string;
  reason?: string;
}

export interface ITeacherProfile extends Document {
  userId: mongoose.Types.ObjectId;
  bio: string;
  certifications: string[];
  specialties: GoalType[];
  cefrLevels: CefrLevel[];
  languages: string[];
  introVideoUrl?: string;
  payPerSessionVnd: number;
  maxStudents: number;
  timezone: string;
  weeklyAvailability: PreferredSlot[];
  exceptions: ITeacherException[];
  ratingAvg: number;
  reviewsCount: number;
  qualityScore: number;
  bookingLockSeq: number;
}

const teacherProfileSchema = new Schema<ITeacherProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    bio: { type: String, default: '' },
    certifications: { type: [String], default: [] },
    specialties: {
      type: [String],
      enum: ['ielts', 'toeic', 'communication', 'business', 'kids', 'interview', 'other'],
      default: [],
      index: true,
    },
    cefrLevels: {
      type: [String],
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      default: ['A2', 'B1', 'B2'],
    },
    languages: { type: [String], default: ['English'] },
    introVideoUrl: { type: String },
    payPerSessionVnd: { type: Number, default: 260000 },
    maxStudents: { type: Number, default: 20 },
    timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
    weeklyAvailability: {
      type: [
        {
          dayOfWeek: { type: Number, required: true },
          startTime: { type: String, required: true },
          endTime: { type: String, required: true },
        },
      ],
      default: [],
    },
    exceptions: {
      type: [
        {
          date: { type: String, required: true },
          type: { type: String, enum: ['off', 'extra'], required: true },
          startTime: { type: String },
          endTime: { type: String },
          reason: { type: String },
        },
      ],
      default: [],
    },
    ratingAvg: { type: Number, default: 4.8 },
    reviewsCount: { type: Number, default: 0 },
    qualityScore: { type: Number, default: 95 },
    bookingLockSeq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

teacherProfileSchema.index({ ratingAvg: -1, qualityScore: -1 });

export const TeacherProfile = mongoose.model<ITeacherProfile>(
  'TeacherProfile',
  teacherProfileSchema,
);
