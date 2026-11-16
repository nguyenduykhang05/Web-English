import mongoose, { Schema, type Document } from 'mongoose';
import type {
  CefrLevel,
  GoalType,
  PreferredSlot,
  SkillScores,
  StudentLifecycle,
} from '@webenglish/shared';

export interface IStudentProfile extends Document {
  userId: mongoose.Types.ObjectId;
  occupation?: string;
  isMinor: boolean;
  guardian?: {
    fullName: string;
    phone: string;
    email?: string;
    relationship?: string;
  };
  goal?: {
    goalType: GoalType;
    targetScore?: string;
    deadline?: Date;
    description?: string;
  };
  currentCefr: CefrLevel;
  skillScores: SkillScores;
  favoriteTopics: string[];
  preferredSlots: PreferredSlot[];
  weaknesses: string[];
  lifecycleStatus: StudentLifecycle;
  leadSource?: string;
  internalNotes?: string;
  consents: {
    dataPrivacyAccepted: boolean;
    aiProcessingAccepted: boolean;
    acceptedAt?: Date;
  };
  bookingLockSeq: number;
}

const studentProfileSchema = new Schema<IStudentProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    occupation: { type: String },
    isMinor: { type: Boolean, default: false },
    guardian: {
      fullName: { type: String },
      phone: { type: String },
      email: { type: String },
      relationship: { type: String },
    },
    goal: {
      goalType: {
        type: String,
        enum: ['ielts', 'toeic', 'communication', 'business', 'kids', 'interview', 'other'],
      },
      targetScore: { type: String },
      deadline: { type: Date },
      description: { type: String },
    },
    currentCefr: {
      type: String,
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      default: 'B1',
      index: true,
    },
    skillScores: {
      listening: { type: Number, default: 50 },
      speaking: { type: Number, default: 45 },
      reading: { type: Number, default: 50 },
      writing: { type: Number, default: 45 },
      vocabulary: { type: Number, default: 50 },
      grammar: { type: Number, default: 50 },
      pronunciation: { type: Number, default: 45 },
    },
    favoriteTopics: { type: [String], default: [] },
    preferredSlots: {
      type: [
        {
          dayOfWeek: { type: Number, required: true },
          startTime: { type: String, required: true },
          endTime: { type: String, required: true },
        },
      ],
      default: [],
    },
    weaknesses: { type: [String], default: [] },
    lifecycleStatus: {
      type: String,
      enum: ['lead', 'trial', 'active', 'paused', 'completed', 'churned'],
      default: 'lead',
      index: true,
    },
    leadSource: { type: String },
    internalNotes: { type: String },
    consents: {
      dataPrivacyAccepted: { type: Boolean, default: false },
      aiProcessingAccepted: { type: Boolean, default: false },
      acceptedAt: { type: Date },
    },
    bookingLockSeq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

studentProfileSchema.index({ lifecycleStatus: 1, currentCefr: 1 });
studentProfileSchema.index({ 'goal.goalType': 1 });

export const StudentProfile = mongoose.model<IStudentProfile>(
  'StudentProfile',
  studentProfileSchema,
);
