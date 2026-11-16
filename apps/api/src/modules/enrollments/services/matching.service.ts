import type { PreferredSlot } from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { User } from '../../users/models/user.model.js';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function slotsOverlap(a: PreferredSlot, b: PreferredSlot): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) >= 30;
}

export interface MatchedTeacherResult {
  teacherUserId: string;
  fullName: string;
  timezone: string;
  ratingAvg: number;
  specialties: string[];
  cefrLevels: string[];
  score: number;
  breakdown: {
    specialty: number;
    cefr: number;
    schedule: number;
    rating: number;
    loadBalance: number;
  };
  reasons: string[];
}

/**
 * M5 Teacher Matching Algorithm (SPEC.md A5 M5):
 * Weights: Specialty 35% + CEFR 15% + Availability Overlap 25% + Rating 15% + Load Balance 10%.
 * Returns Top 5 teachers with breakdown & human-readable reasons.
 */
export async function matchTeachersForStudent(
  studentUserId: string,
): Promise<MatchedTeacherResult[]> {
  const student = await StudentProfile.findOne({ userId: studentUserId }).lean();
  if (!student) {
    throw new AppError(404, 'NOT_FOUND', 'Student profile not found');
  }

  const activeTeachers = await User.find({ role: 'teacher', status: 'active' })
    .select('fullName')
    .lean();
  const teacherIds = activeTeachers.map((t) => t._id);
  const nameMap = new Map(activeTeachers.map((t) => [String(t._id), t.fullName]));

  const [profiles, activeEnrollments] = await Promise.all([
    TeacherProfile.find({ userId: { $in: teacherIds } }).lean(),
    Enrollment.aggregate<{ _id: string; count: number }>([
      { $match: { teacherId: { $in: teacherIds }, status: 'active' } },
      { $group: { _id: { $toString: '$teacherId' }, count: { $sum: 1 } } },
    ]),
  ]);

  const loadMap = new Map(activeEnrollments.map((e) => [e._id, e.count]));
  const goalType = student.goal?.goalType;

  const ranked = profiles.map((p) => {
    const uid = String(p.userId);
    const reasons: string[] = [];

    // 1. Specialty (35%)
    const specialtyMatch = goalType && p.specialties.includes(goalType) ? 35 : p.specialties.length > 0 ? 12 : 0;
    if (specialtyMatch === 35 && goalType) {
      reasons.push(`Đúng chuyên môn ${goalType.toUpperCase()}`);
    }

    // 2. CEFR (15%)
    const cefrMatch = p.cefrLevels.includes(student.currentCefr) ? 15 : 5;
    if (cefrMatch === 15) {
      reasons.push(`Kinh nghiệm dạy trình độ CEFR ${student.currentCefr}`);
    }

    // 3. Schedule overlap (25%)
    let scheduleScore = 15;
    if (student.preferredSlots.length > 0) {
      let overlapCount = 0;
      for (const sSlot of student.preferredSlots) {
        if (p.weeklyAvailability.some((tSlot) => slotsOverlap(sSlot, tSlot))) {
          overlapCount += 1;
        }
      }
      scheduleScore = Math.round((overlapCount / student.preferredSlots.length) * 25);
      if (overlapCount > 0) {
        reasons.push(`Trùng ${overlapCount} khung giờ học ưu tiên`);
      }
    }

    // 4. Rating (15%)
    const ratingScore = Math.round((Math.min(5, Math.max(0, p.ratingAvg)) / 5) * 15);

    // 5. Load balance (10%)
    const currentStudents = loadMap.get(uid) ?? 0;
    const capacityRatio = Math.max(0, (p.maxStudents - currentStudents) / Math.max(1, p.maxStudents));
    const loadScore = Math.round(capacityRatio * 10);
    if (capacityRatio >= 0.5) {
      reasons.push('Còn nhiều slot trống để kèm sát hàng tuần');
    }

    const total = specialtyMatch + cefrMatch + scheduleScore + ratingScore + loadScore;
    return {
      teacherUserId: uid,
      fullName: nameMap.get(uid) ?? '',
      timezone: p.timezone,
      ratingAvg: p.ratingAvg,
      specialties: p.specialties,
      cefrLevels: p.cefrLevels,
      score: total,
      breakdown: {
        specialty: specialtyMatch,
        cefr: cefrMatch,
        schedule: scheduleScore,
        rating: ratingScore,
        loadBalance: loadScore,
      },
      reasons,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, 5);
}
