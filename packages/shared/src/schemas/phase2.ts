import { z } from 'zod';
import { MeetingProviderEnum, SessionStatusEnum } from '../enums.js';

export const GetSlotsQuerySchema = z.object({
  teacherId: z.string().trim().min(1),
  from: z.string().datetime().optional(),
  days: z.coerce.number().int().min(1).max(30).default(7),
  durationMinutes: z.coerce.number().int().min(15).max(120).default(45),
});

export const CreateBookingSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  teacherId: z.string().trim().min(1),
  enrollmentId: z.string().trim().min(1).optional(),
  startAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(120),
  isTrial: z.boolean().default(false),
  recurringCount: z.number().int().min(1).max(12).default(1),
  meetingProvider: MeetingProviderEnum.default('jitsi'),
  manualJoinUrl: z.string().trim().url().optional(),
  title: z.string().trim().min(1).max(160).optional(),
});

export const RescheduleSessionSchema = z.object({
  newStartAt: z.string().datetime(),
  reason: z.string().trim().max(400).optional(),
});

export const CancelSessionSchema = z.object({
  reason: z.string().trim().max(400).optional(),
});

export const QuickNoteKindEnum = z.enum(['vocab', 'grammar', 'pronunciation']);

export const CreateQuickNoteSchema = z.object({
  kind: QuickNoteKindEnum,
  term: z.string().trim().min(1).max(200),
  correction: z.string().trim().min(1).max(400),
  contextNote: z.string().trim().max(500).optional(),
});

export const UpdateSharedNotesSchema = z.object({
  content: z.string().max(10000),
});

export const SessionChatMessageSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const ListSessionsQuerySchema = z.object({
  status: SessionStatusEnum.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type GetSlotsQuery = z.infer<typeof GetSlotsQuerySchema>;
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type RescheduleSessionInput = z.infer<typeof RescheduleSessionSchema>;
export type CancelSessionInput = z.infer<typeof CancelSessionSchema>;
export type QuickNoteKind = z.infer<typeof QuickNoteKindEnum>;
export type CreateQuickNoteInput = z.infer<typeof CreateQuickNoteSchema>;
export type UpdateSharedNotesInput = z.infer<typeof UpdateSharedNotesSchema>;
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;
