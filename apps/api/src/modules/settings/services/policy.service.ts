import type { CefrLevel } from '@webenglish/shared';
import { Setting } from '../models/setting.model.js';

export interface BookingPolicies {
  cancelFreeHours: number;
  rescheduleFreeHours: number;
  rescheduleMaxCount: number;
  minBookingNoticeHours: number;
  maxBookingAdvanceDays: number;
  noShowMinutes: number;
  slotStepMinutes: number;
  bufferMinutes: number;
  sessionDurationOptions: number[];
  roomOpenBeforeMinutes: number;
  roomCloseAfterMinutes: number;
  reminderOffsetsMinutes: number[];
  reportDueHours: number;
  reportEditWindowHours: number;
  reviewWindowDays: number;
  studentNoShowTeacherPayPercent: number;
  skillEmaAlpha: number;
  lowRatingAlertThreshold: number;
}

const POLICY_KEYS = [
  'policies.cancelFreeHours',
  'policies.rescheduleFreeHours',
  'policies.rescheduleMaxCount',
  'policies.minBookingNoticeHours',
  'policies.maxBookingAdvanceDays',
  'policies.noShowMinutes',
  'policies.slotStepMinutes',
  'policies.bufferMinutes',
  'policies.sessionDurationMin',
  'policies.roomOpenBeforeMinutes',
  'policies.roomCloseAfterMinutes',
  'policies.reminderOffsetsMinutes',
  'policies.reportDueHours',
  'policies.reportEditWindowHours',
  'policies.reviewWindowDays',
  'policies.studentNoShowTeacherPayPercent',
  'policies.skillEmaAlpha',
  'policies.lowRatingAlertThreshold',
];

function readNumericField(
  map: Map<string, Record<string, unknown>>,
  key: string,
  field: string,
  fallback: number,
): number {
  const val = map.get(key)?.[field];
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

function readNumericArrayField(
  map: Map<string, Record<string, unknown>>,
  key: string,
  field: string,
  fallback: number[],
): number[] {
  const val = map.get(key)?.[field];
  if (!Array.isArray(val)) return fallback;
  const nums = val.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return nums.length > 0 ? nums : fallback;
}

/**
 * Loads dynamic policy parameters from Settings collection with spec defaults as fallbacks.
 */
export async function getBookingPolicies(): Promise<BookingPolicies> {
  const rows = await Setting.find({ key: { $in: POLICY_KEYS } }).lean();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    cancelFreeHours: readNumericField(map, 'policies.cancelFreeHours', 'hours', 12),
    rescheduleFreeHours: readNumericField(map, 'policies.rescheduleFreeHours', 'hours', 12),
    rescheduleMaxCount: readNumericField(map, 'policies.rescheduleMaxCount', 'count', 2),
    minBookingNoticeHours: readNumericField(map, 'policies.minBookingNoticeHours', 'hours', 6),
    maxBookingAdvanceDays: readNumericField(map, 'policies.maxBookingAdvanceDays', 'days', 30),
    noShowMinutes: readNumericField(map, 'policies.noShowMinutes', 'minutes', 10),
    slotStepMinutes: readNumericField(map, 'policies.slotStepMinutes', 'minutes', 30),
    bufferMinutes: readNumericField(map, 'policies.bufferMinutes', 'minutes', 5),
    sessionDurationOptions: readNumericArrayField(map, 'policies.sessionDurationMin', 'options', [25, 45, 60]),
    roomOpenBeforeMinutes: readNumericField(map, 'policies.roomOpenBeforeMinutes', 'minutes', 10),
    roomCloseAfterMinutes: readNumericField(map, 'policies.roomCloseAfterMinutes', 'minutes', 15),
    reminderOffsetsMinutes: readNumericArrayField(
      map,
      'policies.reminderOffsetsMinutes',
      'offsets',
      [1440, 120, 10],
    ),
    reportDueHours: readNumericField(map, 'policies.reportDueHours', 'hours', 24),
    reportEditWindowHours: readNumericField(map, 'policies.reportEditWindowHours', 'hours', 48),
    reviewWindowDays: readNumericField(map, 'policies.reviewWindowDays', 'days', 7),
    studentNoShowTeacherPayPercent: readNumericField(
      map,
      'policies.studentNoShowTeacherPayPercent',
      'percent',
      100,
    ),
    skillEmaAlpha: readNumericField(map, 'policies.skillEmaAlpha', 'alpha', 0.3),
    lowRatingAlertThreshold: readNumericField(map, 'policies.lowRatingAlertThreshold', 'rating', 2),
  };
}

/**
 * Spec A6 CEFR scale mapping: <20 A1, 20-34 A2, 35-54 B1, 55-71 B2, 72-87 C1, >=88 C2.
 */
export function scoreToCefrLevel(score: number): CefrLevel {
  if (score < 20) return 'A1';
  if (score < 35) return 'A2';
  if (score < 55) return 'B1';
  if (score < 72) return 'B2';
  if (score < 88) return 'C1';
  return 'C2';
}
