import { z } from 'zod';
import { SkillScoresSchema } from './phase1.js';

export const ReportVocabItemSchema = z.object({
  term: z.string().trim().min(1).max(200),
  correction: z.string().trim().min(1).max(400),
  contextNote: z.string().trim().max(500).optional(),
});

export const CreateSessionReportSchema = z.object({
  summary: z.string().trim().min(5).max(3000),
  strengths: z.array(z.string().trim().min(1).max(200)).max(15).default([]),
  weaknesses: z.array(z.string().trim().min(1).max(200)).max(15).default([]),
  nextFocus: z.string().trim().max(600).optional(),
  homeworkSuggestion: z.string().trim().max(1000).optional(),
  skillRatings: SkillScoresSchema.partial().optional(),
  vocabItems: z.array(ReportVocabItemSchema).max(50).optional(),
});

export const CreateSessionReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1500).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
});

export const AdvanceAlertSchema = z.object({
  status: z.enum(['ack', 'resolved']),
  resolutionNote: z.string().trim().max(500).optional(),
});

export const GeneratePayrollSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM'),
  teacherId: z.string().trim().min(1).optional(),
});

export const UpdatePayrollAdjustmentSchema = z.object({
  bonusVnd: z.number().int().min(0).max(100_000_000).optional(),
  deductionVnd: z.number().int().min(0).max(100_000_000).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const RefundInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  refundAmountVnd: z.number().int().min(0).optional(),
});

export type CreateSessionReportInput = z.infer<typeof CreateSessionReportSchema>;
export type CreateSessionReviewInput = z.infer<typeof CreateSessionReviewSchema>;
export type AdvanceAlertInput = z.infer<typeof AdvanceAlertSchema>;
export type GeneratePayrollInput = z.infer<typeof GeneratePayrollSchema>;
export type UpdatePayrollAdjustmentInput = z.infer<typeof UpdatePayrollAdjustmentSchema>;
export type RefundInvoiceInput = z.infer<typeof RefundInvoiceSchema>;
