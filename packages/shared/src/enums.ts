import { z } from 'zod';

export const UserRoleEnum = z.enum(['admin', 'teacher', 'student']);
export const UserStatusEnum = z.enum(['pending', 'active', 'locked']);
export const SessionStatusEnum = z.enum([
  'scheduled',
  'in_progress',
  'completed',
  'cancelled_by_student',
  'cancelled_by_teacher',
  'cancelled_by_admin',
  'no_show_student',
  'no_show_teacher',
  'rescheduled'
]);
export const EnrollmentStatusEnum = z.enum([
  'pending_payment',
  'active',
  'paused',
  'completed',
  'churned'
]);
export const GoalTypeEnum = z.enum([
  'ielts',
  'toeic',
  'communication',
  'business',
  'kids',
  'interview',
  'other'
]);
export const CefrEnum = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export const InvoiceStatusEnum = z.enum([
  'unpaid',
  'partially_paid',
  'paid',
  'void',
  'refunded'
]);
export const PaymentStatusEnum = z.enum([
  'pending',
  'confirmed',
  'failed',
  'refunded'
]);
export const AlertStatusEnum = z.enum(['open', 'ack', 'resolved']);
export const AssessmentTypeEnum = z.enum(['placement', 'progress', 'final']);
export const HomeworkStatusEnum = z.enum([
  'assigned',
  'submitted',
  'graded',
  'overdue'
]);
export const AiProviderEnum = z.enum(['mock', 'anthropic', 'openai', 'gemini']);
export const MeetingProviderEnum = z.enum(['jitsi', 'manual_link']);

export type UserRole = z.infer<typeof UserRoleEnum>;
export type UserStatus = z.infer<typeof UserStatusEnum>;
export type SessionStatus = z.infer<typeof SessionStatusEnum>;
export type EnrollmentStatus = z.infer<typeof EnrollmentStatusEnum>;
export type GoalType = z.infer<typeof GoalTypeEnum>;
export type CefrLevel = z.infer<typeof CefrEnum>;
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;
export type AlertStatus = z.infer<typeof AlertStatusEnum>;
export type AssessmentType = z.infer<typeof AssessmentTypeEnum>;
export type HomeworkStatus = z.infer<typeof HomeworkStatusEnum>;
export type AiProvider = z.infer<typeof AiProviderEnum>;
export type MeetingProvider = z.infer<typeof MeetingProviderEnum>;
