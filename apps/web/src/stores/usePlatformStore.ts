import { create } from 'zustand';
import {
  INITIAL_ALERTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_HOMEWORK,
  INITIAL_INVOICES,
  INITIAL_LEDGER,
  INITIAL_MILESTONES,
  INITIAL_MISTAKES_VOCAB,
  INITIAL_NOTIFICATIONS,
  INITIAL_SESSIONS,
  INITIAL_SETTINGS,
  SAMPLE_STUDENT,
  STUDENT_CURRENT_SKILLS,
} from '@/data/mockPlatformData';
import type {
  AuditLogItem,
  HomeworkItem,
  InvoiceRecord,
  LearningMilestone,
  LedgerEntry,
  MistakeVocabEntry,
  NotificationItem,
  QualityAlert,
  SessionRecord,
  SkillRatings,
  SystemSettings,
  TeacherProfile,
} from '@/types/domain';

interface PlatformState {
  ledger: LedgerEntry[];
  sessions: SessionRecord[];
  milestones: LearningMilestone[];
  homework: HomeworkItem[];
  invoices: InvoiceRecord[];
  alerts: QualityAlert[];
  settings: SystemSettings;
  auditLogs: AuditLogItem[];
  mistakesVocab: MistakeVocabEntry[];
  notifications: NotificationItem[];
  sharedNotes: string;
  skills: SkillRatings;

  bookSlot: (teacher: TeacherProfile, slotId: string, recurringWeekly: boolean) => boolean;
  cancelSession: (sessionId: string, refundToLedger: boolean) => void;
  submitHomework: (homeworkId: string, note: string) => void;
  decideProposedMilestone: (
    milestoneId: string,
    decision: 'accepted' | 'rejected',
    actorName: string,
  ) => void;
  submitSessionReport: (sessionId: string, summary: string) => void;
  markTransferSent: (invoiceId: string) => void;
  confirmInvoicePayment: (invoiceId: string, adminName: string) => void;
  advanceAlertStatus: (alertId: string) => void;
  updateSettings: (next: SystemSettings, adminName: string) => void;
  updateSharedNotes: (notes: string) => void;
  addMistakeVocab: (entry: Omit<MistakeVocabEntry, 'id'>) => void;
  markAllNotificationsRead: () => void;
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  ledger: INITIAL_LEDGER,
  sessions: INITIAL_SESSIONS,
  milestones: INITIAL_MILESTONES,
  homework: INITIAL_HOMEWORK,
  invoices: INITIAL_INVOICES,
  alerts: INITIAL_ALERTS,
  settings: INITIAL_SETTINGS,
  auditLogs: INITIAL_AUDIT_LOGS,
  mistakesVocab: INITIAL_MISTAKES_VOCAB,
  notifications: INITIAL_NOTIFICATIONS,
  sharedNotes:
    'Mục tiêu buổi #07:\n- Luyện cấu trúc mở rộng ý Part 3: Point -> Contrast -> Urban Example\n- Chú ý âm cuối /s/, /z/ trong danh từ số nhiều\n- Từ vựng trọng tâm: urban sprawl, public infrastructure, mitigate congestion',
  skills: STUDENT_CURRENT_SKILLS,

  bookSlot: (teacher, slotId, recurringWeekly) => {
    const balance = get().ledger.reduce((acc, row) => acc + row.delta, 0);
    if (balance <= 0) return false;
    const slot = teacher.availableSlots.find((item) => item.id === slotId);
    if (!slot) return false;

    const newSessionId = `ses-${Math.floor(200 + Math.random() * 799)}`;
    const newSession: SessionRecord = {
      id: newSessionId,
      title: `Buổi 1-1 mới: Luyện tập cùng ${teacher.name}${recurringWeekly ? ' (Cố định tuần)' : ''}`,
      studentId: SAMPLE_STUDENT.id,
      studentName: SAMPLE_STUDENT.name,
      teacherId: teacher.id,
      teacherName: teacher.name,
      startIso: `${slot.dateIso}T${slot.timeSlot}:00+07:00`,
      dateLabel: slot.dateLabel,
      timeRange: `${slot.timeSlot} – ${slot.endTimeSlot}`,
      durationMinutes: 50,
      status: 'scheduled',
      meetingProvider: 'jitsi',
      roomCode: `we-room-${Math.random().toString(36).slice(2, 8)}`,
      milestoneTitle: 'Chặng 2: Speaking Fluency & Part 3 Reasoning',
      reportSubmitted: false,
    };

    const ledgerEntry: LedgerEntry = {
      id: `led-${Date.now()}`,
      occurredAt: 'Vừa xong · GMT+7',
      type: 'debit',
      delta: -1,
      reason: `Đặt lịch ${slot.dateLabel} (${slot.timeSlot}) với ${teacher.name}`,
      sessionId: newSessionId,
      actor: SAMPLE_STUDENT.name,
    };

    set((state) => ({
      sessions: [newSession, ...state.sessions],
      ledger: [ledgerEntry, ...state.ledger],
    }));
    return true;
  },

  cancelSession: (sessionId, refundToLedger) => {
    const target = get().sessions.find((s) => s.id === sessionId);
    if (!target || target.status !== 'scheduled') return;

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: 'cancelled_by_student' } : s,
      ),
      ledger: refundToLedger
        ? [
            {
              id: `led-${Date.now()}`,
              occurredAt: 'Vừa xong · GMT+7',
              type: 'refund',
              delta: 1,
              reason: `Hoàn buổi huỷ hợp lệ (> ${state.settings.cancelFreeHours}h): ${target.dateLabel}`,
              sessionId,
              actor: 'Quy tắc chính sách',
            },
            ...state.ledger,
          ]
        : state.ledger,
    }));
  },

  submitHomework: (homeworkId, note) =>
    set((state) => ({
      homework: state.homework.map((hw) =>
        hw.id === homeworkId
          ? { ...hw, status: 'submitted', submittedNote: note, dueLabel: 'Vừa nộp' }
          : hw,
      ),
    })),

  decideProposedMilestone: (milestoneId, decision, actorName) =>
    set((state) => {
      const target = state.milestones.find((m) => m.id === milestoneId);
      const nextMilestones =
        decision === 'accepted'
          ? state.milestones.map((m) =>
              m.id === milestoneId
                ? { ...m, status: 'in_progress' as const, humanDecisionBy: actorName }
                : m,
            )
          : state.milestones.filter((m) => m.id !== milestoneId);

      const logItem: AuditLogItem = {
        id: `aud-${Date.now()}`,
        timestampLabel: 'Vừa xong · GMT+7',
        actor: actorName,
        role: 'teacher',
        action:
          decision === 'accepted'
            ? `Chấp nhận đề xuất AI: ${target?.title ?? milestoneId}`
            : `Từ chối đề xuất AI: ${target?.title ?? milestoneId}`,
        target: SAMPLE_STUDENT.name,
        decisionStatus: decision,
      };

      return {
        milestones: nextMilestones,
        auditLogs: [logItem, ...state.auditLogs],
      };
    }),

  submitSessionReport: (sessionId, summary) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, reportSubmitted: true, reportDueLabel: undefined } : s,
      ),
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          timestampLabel: 'Vừa xong · GMT+7',
          actor: 'Ms. Sarah Jenkins',
          role: 'teacher',
          action: `Lưu báo cáo buổi học (${sessionId}): ${summary.slice(0, 60)}`,
          target: SAMPLE_STUDENT.name,
        },
        ...state.auditLogs,
      ],
    })),

  markTransferSent: (invoiceId) =>
    set((state) => ({
      invoices: state.invoices.map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'pending_verification' } : inv,
      ),
    })),

  confirmInvoicePayment: (invoiceId, adminName) => {
    const invoice = get().invoices.find((inv) => inv.id === invoiceId);
    if (!invoice || invoice.status === 'paid') return;

    const creditRow: LedgerEntry = {
      id: `led-${Date.now()}`,
      occurredAt: 'Vừa xong · GMT+7',
      type: 'credit',
      delta: invoice.sessionsCount,
      reason: `Xác nhận thanh toán ${invoice.packageName}`,
      invoiceCode: invoice.code,
      actor: adminName,
    };

    const auditItem: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestampLabel: 'Vừa xong · GMT+7',
      actor: adminName,
      role: 'admin',
      action: `Xác nhận chuyển khoản ${invoice.code} (+${invoice.sessionsCount} buổi vào sổ cái)`,
      target: invoice.studentName,
      decisionStatus: 'accepted',
    };

    set((state) => ({
      invoices: state.invoices.map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'paid' } : inv,
      ),
      ledger: [creditRow, ...state.ledger],
      auditLogs: [auditItem, ...state.auditLogs],
    }));
  },

  advanceAlertStatus: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((alert) => {
        if (alert.id !== alertId) return alert;
        const nextStatus =
          alert.status === 'open' ? 'ack' : alert.status === 'ack' ? 'resolved' : 'resolved';
        return { ...alert, status: nextStatus };
      }),
    })),

  updateSettings: (next, adminName) =>
    set((state) => ({
      settings: next,
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          timestampLabel: 'Vừa xong · GMT+7',
          actor: adminName,
          role: 'admin',
          action: `Cập nhật chính sách hệ thống (Huỷ ${next.cancelFreeHours}h, Báo cáo ${next.reportDueHours}h)`,
          target: 'Settings',
        },
        ...state.auditLogs,
      ],
    })),

  updateSharedNotes: (sharedNotes) => set({ sharedNotes }),

  addMistakeVocab: (entry) =>
    set((state) => ({
      mistakesVocab: [
        { ...entry, id: `mv-${Date.now()}` },
        ...state.mistakesVocab,
      ],
    })),

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, unread: false })),
    })),
}));
