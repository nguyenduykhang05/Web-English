import mongoose, { Schema, type Document } from 'mongoose';
import type { CefrLevel, GoalType, SkillKey } from '@webenglish/shared';

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'proposed' | 'rejected';

export interface ILearningMilestone {
  id: string;
  title: string;
  description: string;
  cefrTarget: CefrLevel;
  skillFocus: SkillKey;
  plannedSessions: number;
  completedSessions: number;
  status: MilestoneStatus;
  source: 'template' | 'rule_engine' | 'teacher' | 'ai';
  adjustmentType?: 'reinforce' | 'accelerate';
  aiReason?: string;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
}

export interface ILearningPath extends Document {
  studentId: mongoose.Types.ObjectId;
  templateCode?: string;
  title: string;
  goalType: GoalType;
  targetCefr: CefrLevel;
  milestones: ILearningMilestone[];
  paceStatus: 'on_track' | 'at_risk' | 'off_track';
}

const learningPathSchema = new Schema<ILearningPath>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    templateCode: { type: String },
    title: { type: String, required: true },
    goalType: {
      type: String,
      enum: ['ielts', 'toeic', 'communication', 'business', 'kids', 'interview', 'other'],
      required: true,
    },
    targetCefr: {
      type: String,
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      required: true,
    },
    milestones: {
      type: [
        {
          id: { type: String, required: true },
          title: { type: String, required: true },
          description: { type: String, default: '' },
          cefrTarget: {
            type: String,
            enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
            required: true,
          },
          skillFocus: {
            type: String,
            enum: ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar', 'pronunciation'],
            required: true,
          },
          plannedSessions: { type: Number, required: true, min: 1 },
          completedSessions: { type: Number, default: 0, min: 0 },
          status: {
            type: String,
            enum: ['pending', 'in_progress', 'completed', 'proposed', 'rejected'],
            default: 'pending',
          },
          source: { type: String, enum: ['template', 'rule_engine', 'teacher', 'ai'], default: 'template' },
          adjustmentType: { type: String, enum: ['reinforce', 'accelerate'] },
          aiReason: { type: String },
          decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          decidedAt: { type: Date },
        },
      ],
      default: [],
    },
    paceStatus: {
      type: String,
      enum: ['on_track', 'at_risk', 'off_track'],
      default: 'on_track',
    },
  },
  { timestamps: true },
);

learningPathSchema.index({ studentId: 1, updatedAt: -1 });

export const LearningPath = mongoose.model<ILearningPath>('LearningPath', learningPathSchema);
