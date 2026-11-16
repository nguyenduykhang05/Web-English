import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { AppError } from '../../../middleware/errorHandler.js';
import { getBookingPolicies, type BookingPolicies } from '../../settings/services/policy.service.js';
import { TeacherProfile, type ITeacherException, type ITeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { User } from '../../users/models/user.model.js';
import { Session } from '../models/session.model.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface UtcInterval {
  start: Date;
  end: Date;
}

function subtractInterval(base: UtcInterval, blocker: UtcInterval): UtcInterval[] {
  if (blocker.end <= base.start || blocker.start >= base.end) {
    return [base];
  }
  const result: UtcInterval[] = [];
  if (blocker.start > base.start) {
    result.push({ start: base.start, end: blocker.start });
  }
  if (blocker.end < base.end) {
    result.push({ start: blocker.end, end: base.end });
  }
  return result;
}

function parseTeacherDateTimeToUtc(dateStr: string, hhmm: string, tz: string): Date {
  const safeTz = tz || 'Asia/Ho_Chi_Minh';
  try {
    return dayjs.tz(`${dateStr} ${hhmm}`, 'YYYY-MM-DD HH:mm', safeTz).toDate();
  } catch {
    return dayjs.tz(`${dateStr} ${hhmm}`, 'YYYY-MM-DD HH:mm', 'Asia/Ho_Chi_Minh').toDate();
  }
}

export function getTeacherAvailabilityWindowsInUtc(
  profile: Pick<ITeacherProfile, 'timezone' | 'weeklyAvailability' | 'exceptions'>,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
): UtcInterval[] {
  const tz = profile.timezone || 'Asia/Ho_Chi_Minh';
  let cursor = dayjs(rangeStartUtc).tz(tz).subtract(1, 'day').startOf('day');
  const endCursor = dayjs(rangeEndUtc).tz(tz).add(1, 'day').startOf('day');

  const windows: UtcInterval[] = [];

  while (!cursor.isAfter(endCursor)) {
    const dateStr = cursor.format('YYYY-MM-DD');
    const dow = cursor.day();

    const dayExceptions: ITeacherException[] = (profile.exceptions ?? []).filter(
      (ex) => ex.date === dateStr,
    );
    const fullDayOff = dayExceptions.some((ex) => ex.type === 'off' && (!ex.startTime || !ex.endTime));

    let dayIntervals: UtcInterval[] = [];

    if (!fullDayOff) {
      const weeklyRules = (profile.weeklyAvailability ?? []).filter((r) => r.dayOfWeek === dow);
      for (const rule of weeklyRules) {
        const start = parseTeacherDateTimeToUtc(dateStr, rule.startTime, tz);
        const end = parseTeacherDateTimeToUtc(dateStr, rule.endTime, tz);
        if (end > start) {
          dayIntervals.push({ start, end });
        }
      }

      for (const ex of dayExceptions) {
        if (ex.type === 'extra' && ex.startTime && ex.endTime) {
          const start = parseTeacherDateTimeToUtc(dateStr, ex.startTime, tz);
          const end = parseTeacherDateTimeToUtc(dateStr, ex.endTime, tz);
          if (end > start) {
            dayIntervals.push({ start, end });
          }
        }
      }

      for (const ex of dayExceptions) {
        if (ex.type === 'off' && ex.startTime && ex.endTime) {
          const blockerStart = parseTeacherDateTimeToUtc(dateStr, ex.startTime, tz);
          const blockerEnd = parseTeacherDateTimeToUtc(dateStr, ex.endTime, tz);
          if (blockerEnd > blockerStart) {
            dayIntervals = dayIntervals.flatMap((interval) =>
              subtractInterval(interval, { start: blockerStart, end: blockerEnd }),
            );
          }
        }
      }
    }

    for (const iv of dayIntervals) {
      if (iv.end > rangeStartUtc && iv.start < rangeEndUtc) {
        windows.push({
          start: iv.start < rangeStartUtc ? rangeStartUtc : iv.start,
          end: iv.end > rangeEndUtc ? rangeEndUtc : iv.end,
        });
      }
    }

    cursor = cursor.add(1, 'day');
  }

  return windows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function isIntervalWithinAvailability(
  profile: Pick<ITeacherProfile, 'timezone' | 'weeklyAvailability' | 'exceptions'>,
  startUtc: Date,
  endUtc: Date,
): boolean {
  const windows = getTeacherAvailabilityWindowsInUtc(profile, startUtc, endUtc);
  return windows.some((w) => w.start <= startUtc && w.end >= endUtc);
}

export function intervalsOverlapWithBuffer(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
  bufferMinutes: number,
): boolean {
  const bufferMs = bufferMinutes * 60_000;
  return (
    startA.getTime() < endB.getTime() + bufferMs &&
    endA.getTime() + bufferMs > startB.getTime()
  );
}

export function validateBookingTiming(
  startAt: Date,
  durationMinutes: number,
  policies: BookingPolicies,
  now = new Date(),
): void {
  if (!policies.sessionDurationOptions.includes(durationMinutes)) {
    throw new AppError(
      400,
      'INVALID_DURATION',
      `Allowed durations are ${policies.sessionDurationOptions.join(', ')} minutes`,
    );
  }
  const minStart = new Date(now.getTime() + policies.minBookingNoticeHours * 3_600_000);
  if (startAt < minStart) {
    throw new AppError(
      400,
      'MIN_BOOKING_NOTICE',
      `Sessions must be booked at least ${policies.minBookingNoticeHours} hours in advance`,
    );
  }
  const maxStart = new Date(now.getTime() + policies.maxBookingAdvanceDays * 86_400_000);
  if (startAt > maxStart) {
    throw new AppError(
      400,
      'MAX_BOOKING_ADVANCE',
      `Sessions cannot be booked more than ${policies.maxBookingAdvanceDays} days in advance`,
    );
  }
}

export interface ComputedSlot {
  startAt: string;
  endAt: string;
  teacherTimezone: string;
  teacherLocalLabel: string;
  studentTimezone: string;
  studentLocalLabel: string;
}

export async function calculateAvailableSlots(params: {
  teacherId: string;
  fromIso?: string;
  days: number;
  durationMinutes: number;
  studentTimezone?: string;
}) {
  const [teacherUser, teacherProfile, policies] = await Promise.all([
    User.findOne({ _id: params.teacherId, role: 'teacher', status: 'active' })
      .select('fullName timezone')
      .lean(),
    TeacherProfile.findOne({ userId: params.teacherId }).lean(),
    getBookingPolicies(),
  ]);

  if (!teacherUser || !teacherProfile) {
    throw new AppError(404, 'NOT_FOUND', 'Teacher profile not found or inactive');
  }

  if (!policies.sessionDurationOptions.includes(params.durationMinutes)) {
    throw new AppError(
      400,
      'INVALID_DURATION',
      `Allowed durations are ${policies.sessionDurationOptions.join(', ')} minutes`,
    );
  }

  const now = new Date();
  const minNoticeAt = new Date(now.getTime() + policies.minBookingNoticeHours * 3_600_000);
  const maxAdvanceAt = new Date(now.getTime() + policies.maxBookingAdvanceDays * 86_400_000);

  const requestedFrom = params.fromIso ? new Date(params.fromIso) : now;
  const rangeStart = requestedFrom > minNoticeAt ? requestedFrom : minNoticeAt;
  const rangeEndCandidate = new Date(requestedFrom.getTime() + params.days * 86_400_000);
  const rangeEnd = rangeEndCandidate < maxAdvanceAt ? rangeEndCandidate : maxAdvanceAt;

  if (rangeEnd <= rangeStart) {
    return {
      teacherId: params.teacherId,
      teacherName: teacherUser.fullName,
      teacherTimezone: teacherProfile.timezone,
      slots: [] as ComputedSlot[],
    };
  }

  const [windows, busySessions] = await Promise.all([
    Promise.resolve(getTeacherAvailabilityWindowsInUtc(teacherProfile, rangeStart, rangeEnd)),
    Session.find({
      teacherId: params.teacherId,
      isActive: true,
      startAt: { $lt: new Date(rangeEnd.getTime() + policies.bufferMinutes * 60_000) },
      endAt: { $gt: new Date(rangeStart.getTime() - policies.bufferMinutes * 60_000) },
    })
      .select('startAt endAt')
      .lean(),
  ]);

  const stepMs = policies.slotStepMinutes * 60_000;
  const durationMs = params.durationMinutes * 60_000;
  const studentTz = params.studentTimezone || 'Asia/Ho_Chi_Minh';
  const teacherTz = teacherProfile.timezone || teacherUser.timezone || 'Asia/Ho_Chi_Minh';

  const seenStarts = new Set<number>();
  const slots: ComputedSlot[] = [];

  for (const win of windows) {
    // Align first candidate to exact slot step boundary on UTC clock (00 / 30 min)
    const alignedMs = Math.ceil(win.start.getTime() / stepMs) * stepMs;
    for (let t = alignedMs; t + durationMs <= win.end.getTime(); t += stepMs) {
      if (t < rangeStart.getTime() || t > maxAdvanceAt.getTime() || seenStarts.has(t)) continue;

      const slotStart = new Date(t);
      const slotEnd = new Date(t + durationMs);
      const hasConflict = busySessions.some((busy) =>
        intervalsOverlapWithBuffer(
          slotStart,
          slotEnd,
          busy.startAt,
          busy.endAt,
          policies.bufferMinutes,
        ),
      );
      if (hasConflict) continue;

      seenStarts.add(t);
      slots.push({
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        teacherTimezone: teacherTz,
        teacherLocalLabel: dayjs(slotStart).tz(teacherTz).format('YYYY-MM-DD HH:mm'),
        studentTimezone: studentTz,
        studentLocalLabel: dayjs(slotStart).tz(studentTz).format('YYYY-MM-DD HH:mm'),
      });
    }
  }

  return {
    teacherId: params.teacherId,
    teacherName: teacherUser.fullName,
    teacherTimezone: teacherTz,
    slots,
  };
}
