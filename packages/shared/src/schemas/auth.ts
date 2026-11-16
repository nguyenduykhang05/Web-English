import { z } from 'zod';
import { UserStatusEnum } from '../enums.js';

export const RegisterBodySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
  locale: z.enum(['vi', 'en']).optional(),
});

export const LoginBodySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

export const ForgotPasswordBodySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

export const ResetPasswordBodySchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8).max(128),
});

export const VerifyEmailBodySchema = z.object({
  token: z.string().trim().min(1),
});

export const InviteTeacherBodySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  fullName: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(60).optional(),
  locale: z.enum(['vi', 'en']).optional(),
});

export const AcceptInviteBodySchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120).optional(),
});

export const UpdateProfileBodySchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  avatarUrl: z.string().trim().url().optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
  locale: z.enum(['vi', 'en']).optional(),
  status: UserStatusEnum.optional(),
});

export const UpsertSettingBodySchema = z.object({
  key: z.string().trim().min(1).max(120),
  value: z.record(z.string(), z.unknown()),
});

export type RegisterBodyInput = z.infer<typeof RegisterBodySchema>;
export type LoginBodyInput = z.infer<typeof LoginBodySchema>;
export type ForgotPasswordBodyInput = z.infer<typeof ForgotPasswordBodySchema>;
export type ResetPasswordBodyInput = z.infer<typeof ResetPasswordBodySchema>;
export type VerifyEmailBodyInput = z.infer<typeof VerifyEmailBodySchema>;
export type InviteTeacherBodyInput = z.infer<typeof InviteTeacherBodySchema>;
export type AcceptInviteBodyInput = z.infer<typeof AcceptInviteBodySchema>;
export type UpdateProfileBodyInput = z.infer<typeof UpdateProfileBodySchema>;
export type UpsertSettingBodyInput = z.infer<typeof UpsertSettingBodySchema>;
