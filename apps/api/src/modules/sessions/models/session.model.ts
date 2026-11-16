import mongoose, { Schema, type Document } from 'mongoose';
import type { MeetingProvider, QuickNoteKind, SessionStatus } from '@webenglish/shared';

export interface ISessionJoinLog {
  userId: mongoose.Types.ObjectId;
  role: 'student' | 'teacher';
  action: 'join' | 'leave';
  at: Date;
}

export interface ISessionQuickNote {
  id: string;
  kind: QuickNoteKind;
  term: string;
  correction: string;
  contextNote?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface ISessionChatMessage {
  id: string;
  senderId: mongoose.Types.ObjectId;
  senderName: string;
  senderRole: 'student' | 'teacher';
  text: string;
  sentAt: Date;
}

export interface ISession extends Document {
  studentId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  enrollmentId?: mongoose.Types.ObjectId;
  courseId?: mongoose.Types.ObjectId;
  isTrial: boolean;
  title: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  status: SessionStatus;
  isActive: boolean;
  rescheduleCount: number;
  rescheduledFromSessionId?: mongoose.Types.ObjectId;
  rescheduledToSessionId?: mongoose.Types.ObjectId;
  seriesId?: string;
  meetingProvider: MeetingProvider;
  roomCode: string;
  joinUrl: string;
  teacherJoinedAt?: Date;
  studentJoinedAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  cancelReason?: string;
  cancelledBy?: mongoose.Types.ObjectId;
  cancelledAt?: Date;
  joinLogs: ISessionJoinLog[];
  sharedNotes: string;
  quickNotes: ISessionQuickNote[];
  chatMessages: ISessionChatMessage[];
}

const sessionSchema = new Schema<ISession>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment', index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    isTrial: { type: Boolean, default: false, index: true },
    title: { type: String, required: true, default: '1-on-1 English Session' },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        'scheduled',
        'in_progress',
        'completed',
        'cancelled_by_student',
        'cancelled_by_teacher',
        'cancelled_by_admin',
        'no_show_student',
        'no_show_teacher',
        'rescheduled',
      ],
      default: 'scheduled',
      index: true,
    },
    /**
     * Only active sessions ('scheduled' or 'in_progress') block a teacher/student time slot.
     */
    isActive: { type: Boolean, default: true, index: true },
    rescheduleCount: { type: Number, default: 0, min: 0 },
    rescheduledFromSessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    rescheduledToSessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    seriesId: { type: String, index: true },
    meetingProvider: { type: String, enum: ['jitsi', 'manual_link'], default: 'jitsi' },
    roomCode: { type: String, required: true },
    joinUrl: { type: String, required: true },
    teacherJoinedAt: { type: Date },
    studentJoinedAt: { type: Date },
    startedAt: { type: Date },
    endedAt: { type: Date },
    cancelReason: { type: String },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    joinLogs: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          role: { type: String, enum: ['student', 'teacher'], required: true },
          action: { type: String, enum: ['join', 'leave'], required: true },
          at: { type: Date, required: true },
        },
      ],
      default: [],
    },
    sharedNotes: { type: String, default: '' },
    quickNotes: {
      type: [
        {
          id: { type: String, required: true },
          kind: { type: String, enum: ['vocab', 'grammar', 'pronunciation'], required: true },
          term: { type: String, required: true },
          correction: { type: String, required: true },
          contextNote: { type: String },
          createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          createdAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
    chatMessages: {
      type: [
        {
          id: { type: String, required: true },
          senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          senderName: { type: String, required: true },
          senderRole: { type: String, enum: ['student', 'teacher'], required: true },
          text: { type: String, required: true },
          sentAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

/**
 * Mandatory double-booking guard (AGENTS.md #3):
 * Unique partial index on (teacherId, startAt) for active sessions.
 */
sessionSchema.index(
  { teacherId: 1, startAt: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
sessionSchema.index(
  { studentId: 1, startAt: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
sessionSchema.index({ teacherId: 1, isActive: 1, startAt: 1, endAt: 1 });
sessionSchema.index({ studentId: 1, isActive: 1, startAt: 1, endAt: 1 });

export const Session = mongoose.model<ISession>('Session', sessionSchema);
