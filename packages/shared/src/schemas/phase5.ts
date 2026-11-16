import { z } from 'zod';
import { CefrEnum } from '../enums.js';
import { HomeworkTypeEnum, SkillKeyEnum } from './phase4.js';

export const AIFeatureEnum = z.enum([
  'writing_assessment',
  'speaking_assessment',
  'placement_explanation',
  'path_proposal',
  'exercise_generation',
  'session_summary',
  'weakness_analysis',
  'matching_explanation',
]);

export const AiWritingRequestSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  promptText: z.string().trim().min(5).max(2000),
  essayText: z.string().trim().min(15).max(8000),
  targetBand: z.string().trim().max(20).optional(),
});

export const AiSpeakingRequestSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  promptText: z.string().trim().min(5).max(2000),
  transcriptText: z.string().trim().min(10).max(8000),
  targetBand: z.string().trim().max(20).optional(),
});

export const AiPlacementExplainSchema = z.object({
  assessmentId: z.string().trim().min(1),
});

export const AiPathProposalSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  focusGoal: z.string().trim().max(300).optional(),
});

export const AiExerciseGenSchema = z.object({
  studentId: z.string().trim().min(1),
  skillFocus: SkillKeyEnum,
  cefrLevel: CefrEnum,
  homeworkType: HomeworkTypeEnum.default('multiple_choice'),
  topic: z.string().trim().min(3).max(200),
});

export const AiSessionSummarySchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const AiWeaknessAnalysisSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
});

export const AiMatchingExplainSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  teacherId: z.string().trim().min(1),
});

export const DecideAiProposalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reviewNote: z.string().trim().max(500).optional(),
});

export type AIFeature = z.infer<typeof AIFeatureEnum>;
export type AiWritingRequest = z.infer<typeof AiWritingRequestSchema>;
export type AiSpeakingRequest = z.infer<typeof AiSpeakingRequestSchema>;
export type AiExerciseGenRequest = z.infer<typeof AiExerciseGenSchema>;
export type DecideAiProposalInput = z.infer<typeof DecideAiProposalSchema>;
