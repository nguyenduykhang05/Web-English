import mongoose, { Schema, type Document } from 'mongoose';
import type { AIFeature, AiProvider } from '@webenglish/shared';

export type AiProposalStatus = 'proposed' | 'approved' | 'rejected' | 'failed';

export interface IAILog extends Document {
  feature: AIFeature;
  provider: AiProvider;
  aiModel: string;
  actorId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  promptHash: string;
  redactedInputPreview: string;
  status: AiProposalStatus;
  summary: string;
  result: Record<string, unknown>;
  latencyMs: number;
  tokenEstimate: number;
  consentVerified: boolean;
  piiRedacted: boolean;
  appliedTargetType?: 'LearningPath' | 'Homework' | 'SessionReport' | 'None';
  appliedTargetId?: string;
  appliedSubId?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
}

const aiLogSchema = new Schema<IAILog>(
  {
    feature: {
      type: String,
      enum: [
        'writing_assessment',
        'speaking_assessment',
        'placement_explanation',
        'path_proposal',
        'exercise_generation',
        'session_summary',
        'weakness_analysis',
        'matching_explanation',
      ],
      required: true,
      index: true,
    },
    provider: { type: String, enum: ['mock', 'anthropic', 'openai', 'gemini'], required: true },
    aiModel: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    promptHash: { type: String, required: true },
    redactedInputPreview: { type: String, required: true },
    status: {
      type: String,
      enum: ['proposed', 'approved', 'rejected', 'failed'],
      default: 'proposed',
      index: true,
    },
    summary: { type: String, required: true },
    result: { type: Schema.Types.Mixed, default: {} },
    latencyMs: { type: Number, required: true },
    tokenEstimate: { type: Number, required: true },
    consentVerified: { type: Boolean, default: true },
    piiRedacted: { type: Boolean, default: true },
    appliedTargetType: { type: String, enum: ['LearningPath', 'Homework', 'SessionReport', 'None'] },
    appliedTargetId: { type: String },
    appliedSubId: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
  },
  { timestamps: true },
);

aiLogSchema.index({ studentId: 1, createdAt: -1 });
aiLogSchema.index({ status: 1, createdAt: -1 });

export const AILog = mongoose.model<IAILog>('AILog', aiLogSchema);
