import { z } from 'zod';
import { CefrEnum, GoalTypeEnum } from '../enums.js';

export const SkillScoresSchema = z.object({
  listening: z.number().min(0).max(100).default(50),
  speaking: z.number().min(0).max(100).default(45),
  reading: z.number().min(0).max(100).default(50),
  writing: z.number().min(0).max(100).default(45),
  vocabulary: z.number().min(0).max(100).default(50),
  grammar: z.number().min(0).max(100).default(50),
  pronunciation: z.number().min(0).max(100).default(45),
});

export const PreferredSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export const StudentLifecycleEnum = z.enum([
  'lead',
  'trial',
  'active',
  'paused',
  'completed',
  'churned',
]);

export const UpdateStudentProfileSchema = z.object({
  occupation: z.string().trim().max(120).optional(),
  isMinor: z.boolean().optional(),
  guardian: z
    .object({
      fullName: z.string().trim().min(1).max(120),
      phone: z.string().trim().min(6).max(30),
      email: z.string().trim().email().optional(),
      relationship: z.string().trim().max(60).optional(),
    })
    .optional(),
  goal: z
    .object({
      goalType: GoalTypeEnum,
      targetScore: z.string().trim().max(40).optional(),
      deadline: z.string().datetime().optional(),
      description: z.string().trim().max(500).optional(),
    })
    .optional(),
  currentCefr: CefrEnum.optional(),
  skillScores: SkillScoresSchema.partial().optional(),
  favoriteTopics: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  preferredSlots: z.array(PreferredSlotSchema).max(21).optional(),
  weaknesses: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  lifecycleStatus: StudentLifecycleEnum.optional(),
  leadSource: z.string().trim().max(80).optional(),
  internalNotes: z.string().trim().max(2000).optional(),
  consents: z
    .object({
      dataPrivacyAccepted: z.boolean(),
      aiProcessingAccepted: z.boolean(),
    })
    .optional(),
});

export const TeacherExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['off', 'extra']),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  reason: z.string().trim().max(200).optional(),
});

export const UpsertTeacherProfileSchema = z.object({
  bio: z.string().trim().max(1500).optional(),
  certifications: z.array(z.string().trim().min(1).max(80)).max(15).optional(),
  specialties: z.array(GoalTypeEnum).max(7).optional(),
  cefrLevels: z.array(CefrEnum).max(6).optional(),
  languages: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  introVideoUrl: z.string().trim().url().optional(),
  payPerSessionVnd: z.number().int().min(0).max(5000000).optional(),
  maxStudents: z.number().int().min(1).max(100).optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
  weeklyAvailability: z.array(PreferredSlotSchema).max(42).optional(),
  exceptions: z.array(TeacherExceptionSchema).max(60).optional(),
});

export const CreateCourseSchema = z.object({
  slug: z.string().trim().min(2).max(100).toLowerCase(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000),
  goalType: GoalTypeEnum,
  targetCefrRange: z.array(CefrEnum).min(1).max(6),
  syllabusOutline: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  isPublished: z.boolean().default(true),
});

export const UpdateCourseSchema = CreateCourseSchema.partial();

export const CreateCoursePackageSchema = z.object({
  courseId: z.string().trim().min(1),
  code: z.string().trim().min(2).max(60).toUpperCase(),
  name: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().max(240).optional(),
  sessionsCount: z.number().int().min(1).max(200),
  durationMinutes: z.number().int().min(15).max(120).default(50),
  validityDays: z.number().int().min(7).max(730).default(120),
  priceVnd: z.number().int().min(0).max(200000000),
  originalPriceVnd: z.number().int().min(0).max(200000000).optional(),
  features: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  isActive: z.boolean().default(true),
});

export const UpdateCoursePackageSchema = CreateCoursePackageSchema.partial();

export const CreateCouponSchema = z.object({
  code: z.string().trim().min(2).max(40).toUpperCase(),
  discountType: z.enum(['percent', 'fixed_vnd']),
  discountValue: z.number().int().min(1),
  maxUses: z.number().int().min(1).max(100000).optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
});

export const CreateEnrollmentSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  packageId: z.string().trim().min(1),
  teacherId: z.string().trim().min(1).optional(),
  couponCode: z.string().trim().max(40).toUpperCase().optional(),
  paymentMethod: z.enum(['mock', 'manual_bank_transfer', 'vnpay_sandbox']).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const ConfirmManualPaymentSchema = z.object({
  transactionRef: z.string().trim().min(1).max(120).optional(),
  paidAmountVnd: z.number().int().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const FreezeEnrollmentSchema = z.object({
  days: z.number().int().min(1).max(30),
  reason: z.string().trim().min(3).max(300).optional(),
});

export const LedgerEntryTypeEnum = z.enum([
  'purchase',
  'booking_debit',
  'cancel_refund',
  'makeup_credit',
  'penalty',
  'refund',
  'expire',
  'adjustment',
]);

export type SkillScores = z.infer<typeof SkillScoresSchema>;
export type PreferredSlot = z.infer<typeof PreferredSlotSchema>;
export type StudentLifecycle = z.infer<typeof StudentLifecycleEnum>;
export type UpdateStudentProfileInput = z.infer<typeof UpdateStudentProfileSchema>;
export type UpsertTeacherProfileInput = z.infer<typeof UpsertTeacherProfileSchema>;
export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;
export type CreateCoursePackageInput = z.infer<typeof CreateCoursePackageSchema>;
export type CreateCouponInput = z.infer<typeof CreateCouponSchema>;
export type CreateEnrollmentInput = z.infer<typeof CreateEnrollmentSchema>;
export type ConfirmManualPaymentInput = z.infer<typeof ConfirmManualPaymentSchema>;
export type FreezeEnrollmentInput = z.infer<typeof FreezeEnrollmentSchema>;
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeEnum>;
