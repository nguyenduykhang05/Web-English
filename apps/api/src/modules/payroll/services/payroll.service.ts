import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import type {
  GeneratePayrollInput,
  UpdatePayrollAdjustmentInput,
  UserRole,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { buildCsvDocument } from '../../../utils/csv.js';
import { notifyUser } from '../../notifications/services/notification.service.js';
import { Session } from '../../sessions/models/session.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { getBookingPolicies } from '../../settings/services/policy.service.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { User } from '../../users/models/user.model.js';
import { TeacherPayroll, type IPayrollLineItem } from '../models/teacherPayroll.model.js';

dayjs.extend(utc);
dayjs.extend(timezone);

function getMonthUtcBounds(month: string): { startUtc: Date; endUtc: Date } {
  const start = dayjs.tz(`${month}-01 00:00:00`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Ho_Chi_Minh');
  const end = start.endOf('month');
  return { startUtc: start.toDate(), endUtc: end.toDate() };
}

export async function generateMonthlyPayrolls(
  input: GeneratePayrollInput,
  actor: { id: string; ip?: string },
) {
  const { startUtc, endUtc } = getMonthUtcBounds(input.month);
  const policies = await getBookingPolicies();

  const teacherFilter: Record<string, unknown> = { role: 'teacher', status: 'active' };
  if (input.teacherId) teacherFilter._id = input.teacherId;

  const teachers = await User.find(teacherFilter).select('_id fullName').lean();
  if (teachers.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'No matching teachers found');
  }

  const results = [];

  for (const teacher of teachers) {
    const teacherId = String(teacher._id);
    const existing = await TeacherPayroll.findOne({ month: input.month, teacherId });
    if (existing && existing.status !== 'draft') {
      throw new AppError(
        409,
        'PAYROLL_LOCKED',
        `Payroll for ${teacher.fullName} (${input.month}) is already ${existing.status}`,
      );
    }

    const [profile, sessions] = await Promise.all([
      TeacherProfile.findOne({ userId: teacherId }).select('payPerSessionVnd').lean(),
      Session.find({
        teacherId,
        startAt: { $gte: startUtc, $lte: endUtc },
        status: { $in: ['completed', 'no_show_student', 'no_show_teacher'] },
      })
        .sort({ startAt: 1 })
        .lean(),
    ]);

    const rate = profile?.payPerSessionVnd ?? 260_000;
    const studentIds = [...new Set(sessions.map((s) => String(s.studentId)))];
    const students = await User.find({ _id: { $in: studentIds } }).select('fullName').lean();
    const studentNameMap = new Map(students.map((s) => [String(s._id), s.fullName]));

    let completedSessionsCount = 0;
    let noShowStudentSessionsCount = 0;
    let noShowTeacherSessionsCount = 0;
    let grossVnd = 0;

    const lineItems: IPayrollLineItem[] = sessions.map((s) => {
      let amountVnd = 0;
      if (s.status === 'completed') {
        completedSessionsCount += 1;
        amountVnd = rate;
      } else if (s.status === 'no_show_student') {
        noShowStudentSessionsCount += 1;
        amountVnd = Math.round((rate * policies.studentNoShowTeacherPayPercent) / 100);
      } else {
        noShowTeacherSessionsCount += 1;
        amountVnd = 0;
      }
      grossVnd += amountVnd;
      return {
        sessionId: s._id as unknown as IPayrollLineItem['sessionId'],
        startAt: s.startAt,
        sessionStatus: s.status,
        studentName: studentNameMap.get(String(s.studentId)) ?? 'Học viên',
        amountVnd,
      };
    });

    const bonusVnd = existing?.bonusVnd ?? 0;
    const deductionVnd = existing?.deductionVnd ?? 0;
    const netVnd = Math.max(0, grossVnd + bonusVnd - deductionVnd);

    const saved = await TeacherPayroll.findOneAndUpdate(
      { month: input.month, teacherId },
      {
        month: input.month,
        teacherId,
        completedSessionsCount,
        noShowStudentSessionsCount,
        noShowTeacherSessionsCount,
        ratePerSessionVnd: rate,
        grossVnd,
        bonusVnd,
        deductionVnd,
        netVnd,
        lineItems,
        status: 'draft',
      },
      { new: true, upsert: true },
    ).lean();

    await AuditLog.create({
      actorId: actor.id,
      action: 'payroll.generated',
      entity: 'TeacherPayroll',
      entityId: String(saved._id),
      after: {
        month: input.month,
        teacherId,
        completedSessionsCount,
        noShowStudentSessionsCount,
        noShowTeacherSessionsCount,
        netVnd,
      },
      ip: actor.ip,
    });

    results.push({
      id: String(saved._id),
      month: saved.month,
      teacherId: String(saved.teacherId),
      teacherName: teacher.fullName,
      completedSessionsCount: saved.completedSessionsCount,
      noShowStudentSessionsCount: saved.noShowStudentSessionsCount,
      noShowTeacherSessionsCount: saved.noShowTeacherSessionsCount,
      ratePerSessionVnd: saved.ratePerSessionVnd,
      grossVnd: saved.grossVnd,
      bonusVnd: saved.bonusVnd,
      deductionVnd: saved.deductionVnd,
      netVnd: saved.netVnd,
      status: saved.status,
      lineItems: saved.lineItems,
    });
  }

  return results;
}

export async function listPayrolls(
  actor: { id: string; role: UserRole },
  query: { month?: string },
) {
  if (actor.role === 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot access teacher payroll');
  }

  const filter: Record<string, unknown> = {};
  if (actor.role === 'teacher') {
    filter.teacherId = actor.id;
  }
  if (query.month) {
    filter.month = query.month;
  }

  const docs = await TeacherPayroll.find(filter).sort({ month: -1, createdAt: -1 }).lean();
  const teacherIds = [...new Set(docs.map((d) => String(d.teacherId)))];
  const teachers = await User.find({ _id: { $in: teacherIds } }).select('fullName email').lean();
  const teacherMap = new Map(teachers.map((t) => [String(t._id), t]));

  return docs.map((d) => {
    const t = teacherMap.get(String(d.teacherId));
    return {
      id: String(d._id),
      month: d.month,
      teacherId: String(d.teacherId),
      teacherName: t?.fullName ?? '',
      teacherEmail: t?.email ?? '',
      completedSessionsCount: d.completedSessionsCount,
      noShowStudentSessionsCount: d.noShowStudentSessionsCount,
      noShowTeacherSessionsCount: d.noShowTeacherSessionsCount,
      ratePerSessionVnd: d.ratePerSessionVnd,
      grossVnd: d.grossVnd,
      bonusVnd: d.bonusVnd,
      deductionVnd: d.deductionVnd,
      netVnd: d.netVnd,
      status: d.status,
      approvedAt: d.approvedAt,
      paidAt: d.paidAt,
      notes: d.notes,
      lineItems: d.lineItems,
    };
  });
}

export async function updatePayrollAdjustment(
  payrollId: string,
  input: UpdatePayrollAdjustmentInput,
  actor: { id: string; ip?: string },
) {
  const doc = await TeacherPayroll.findById(payrollId);
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Payroll record not found');
  if (doc.status !== 'draft') {
    throw new AppError(409, 'PAYROLL_LOCKED', 'Only draft payrolls can be adjusted');
  }

  if (input.bonusVnd !== undefined) doc.bonusVnd = input.bonusVnd;
  if (input.deductionVnd !== undefined) doc.deductionVnd = input.deductionVnd;
  if (input.notes !== undefined) doc.notes = input.notes;
  doc.netVnd = Math.max(0, doc.grossVnd + doc.bonusVnd - doc.deductionVnd);
  await doc.save();

  await AuditLog.create({
    actorId: actor.id,
    action: 'payroll.adjusted',
    entity: 'TeacherPayroll',
    entityId: String(doc._id),
    after: { bonusVnd: doc.bonusVnd, deductionVnd: doc.deductionVnd, netVnd: doc.netVnd },
    ip: actor.ip,
  });

  return doc;
}

export async function advancePayrollStatus(
  payrollId: string,
  nextStatus: 'approved' | 'paid',
  actor: { id: string; ip?: string },
) {
  const doc = await TeacherPayroll.findById(payrollId);
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Payroll record not found');

  const validTransition =
    (doc.status === 'draft' && nextStatus === 'approved') ||
    (doc.status === 'approved' && nextStatus === 'paid');
  if (!validTransition) {
    throw new AppError(
      409,
      'INVALID_STATE',
      `Cannot transition payroll from ${doc.status} to ${nextStatus}`,
    );
  }

  const now = new Date();
  doc.status = nextStatus;
  if (nextStatus === 'approved') {
    doc.approvedBy = actor.id as unknown as typeof doc.approvedBy;
    doc.approvedAt = now;
  } else {
    doc.paidAt = now;
  }
  await doc.save();

  await AuditLog.create({
    actorId: actor.id,
    action: `payroll.${nextStatus}`,
    entity: 'TeacherPayroll',
    entityId: String(doc._id),
    after: { month: doc.month, netVnd: doc.netVnd, status: doc.status },
    ip: actor.ip,
  });

  if (nextStatus === 'paid') {
    await notifyUser({
      userId: String(doc.teacherId),
      type: 'system',
      title: `Đã thanh toán lương tháng ${doc.month}`,
      body: `Khoản thù lao ${doc.netVnd.toLocaleString('vi-VN')} VND (${doc.completedSessionsCount} buổi hoàn tất) đã được chuyển khoản.`,
      dedupeKey: `payroll_paid:${String(doc._id)}`,
      referenceType: 'TeacherPayroll',
      referenceId: String(doc._id),
      sendEmail: true,
    });
  }

  return {
    id: String(doc._id),
    status: doc.status,
    approvedAt: doc.approvedAt,
    paidAt: doc.paidAt,
    netVnd: doc.netVnd,
  };
}

export async function exportPayrollsCsv(
  month: string | undefined,
  actor: { id: string; role: UserRole },
): Promise<string> {
  if (actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Only admins can export payroll CSV');
  }
  const rowsData = await listPayrolls(actor, { month });
  const headers = [
    'PayrollId',
    'Month',
    'TeacherName',
    'TeacherEmail',
    'CompletedSessions',
    'NoShowStudent',
    'NoShowTeacher',
    'RateVnd',
    'GrossVnd',
    'BonusVnd',
    'DeductionVnd',
    'NetVnd',
    'Status',
  ];
  const rows = rowsData.map((r) => [
    r.id,
    r.month,
    r.teacherName,
    r.teacherEmail,
    r.completedSessionsCount,
    r.noShowStudentSessionsCount,
    r.noShowTeacherSessionsCount,
    r.ratePerSessionVnd,
    r.grossVnd,
    r.bonusVnd,
    r.deductionVnd,
    r.netVnd,
    r.status,
  ]);
  return buildCsvDocument(headers, rows);
}
