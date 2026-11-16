import { z } from 'zod';
import { CefrEnum, GoalTypeEnum, HomeworkStatusEnum } from '../enums.js';

export const SkillKeyEnum = z.enum([
  'listening',
  'speaking',
  'reading',
  'writing',
  'vocabulary',
  'grammar',
  'pronunciation',
]);

export const HomeworkTypeEnum = z.enum([
  'multiple_choice',
  'fill_blank',
  'matching',
  'essay',
  'speaking',
]);

export const CreateLessonSchema = z.object({
  slug: z.string().trim().min(2).max(120).toLowerCase(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).default(''),
  goalType: GoalTypeEnum,
  cefrLevel: CefrEnum,
  skillFocus: SkillKeyEnum,
  durationMinutes: z.number().int().min(10).max(120).default(45),
  contentMarkdown: z.string().trim().min(5).max(15000),
  sourceName: z.string().trim().max(120).optional(),
  sourceUrl: z.string().trim().url().optional(),
  isPublished: z.boolean().default(true),
});

export const TemplateMilestoneSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).default(''),
  cefrTarget: CefrEnum,
  skillFocus: SkillKeyEnum,
  plannedSessions: z.number().int().min(1).max(40),
});

export const CreatePathTemplateSchema = z.object({
  code: z.string().trim().min(2).max(60).toUpperCase(),
  title: z.string().trim().min(2).max(160),
  goalType: GoalTypeEnum,
  targetCefr: CefrEnum,
  milestones: z.array(TemplateMilestoneSchema).min(1).max(20),
});

export const GenerateLearningPathSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  templateCode: z.string().trim().max(60).optional(),
  goalType: GoalTypeEnum.optional(),
  targetCefr: CefrEnum.optional(),
});

export const MilestoneDecisionSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  editedTitle: z.string().trim().min(2).max(160).optional(),
  editedPlannedSessions: z.number().int().min(1).max(40).optional(),
});

export const UpdateMilestoneProgressSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed']),
  completedSessions: z.number().int().min(0).max(100),
});

export const StartPlacementSchema = z.object({
  targetGoal: GoalTypeEnum.optional(),
});

export const AnswerPlacementStepSchema = z.object({
  questionId: z.string().trim().min(1),
  selectedIndex: z.number().int().min(0).max(3),
});

export const HomeworkQuestionSchema = z.object({
  id: z.string().trim().min(1).max(60),
  type: HomeworkTypeEnum,
  prompt: z.string().trim().min(2).max(1000),
  options: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
  correctAnswer: z.string().trim().max(500).optional(),
  pairs: z
    .array(
      z.object({
        left: z.string().trim().min(1).max(200),
        right: z.string().trim().min(1).max(200),
      }),
    )
    .max(10)
    .optional(),
  maxPoints: z.number().int().min(1).max(100).default(10),
});

export const CreateHomeworkSchema = z.object({
  studentId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  lessonId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(2).max(200),
  homeworkType: HomeworkTypeEnum,
  skillFocus: SkillKeyEnum,
  prompt: z.string().trim().min(5).max(3000),
  questions: z.array(HomeworkQuestionSchema).max(30).default([]),
  maxScore: z.number().int().min(10).max(100).default(100),
  dueAt: z.string().datetime().optional(),
  isProposed: z.boolean().default(false),
});

export const SubmitHomeworkSchema = z.object({
  note: z.string().trim().max(5000).optional(),
  audioUrl: z.string().trim().url().optional(),
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        answer: z.string().trim().max(2000),
      }),
    )
    .max(50)
    .default([]),
});

export const GradeHomeworkSchema = z.object({
  score: z.number().min(0).max(100),
  teacherFeedback: z.string().trim().min(2).max(2000),
});

export const ListHomeworkQuerySchema = z.object({
  studentId: z.string().trim().optional(),
  status: HomeworkStatusEnum.optional(),
});

export type SkillKey = z.infer<typeof SkillKeyEnum>;
export type HomeworkType = z.infer<typeof HomeworkTypeEnum>;
export type CreateLessonInput = z.infer<typeof CreateLessonSchema>;
export type CreatePathTemplateInput = z.infer<typeof CreatePathTemplateSchema>;
export type GenerateLearningPathInput = z.infer<typeof GenerateLearningPathSchema>;
export type MilestoneDecisionInput = z.infer<typeof MilestoneDecisionSchema>;
export type UpdateMilestoneProgressInput = z.infer<typeof UpdateMilestoneProgressSchema>;
export type AnswerPlacementStepInput = z.infer<typeof AnswerPlacementStepSchema>;
export type CreateHomeworkInput = z.infer<typeof CreateHomeworkSchema>;
export type SubmitHomeworkInput = z.infer<typeof SubmitHomeworkSchema>;
export type GradeHomeworkInput = z.infer<typeof GradeHomeworkSchema>;
