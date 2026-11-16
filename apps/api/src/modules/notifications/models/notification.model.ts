import mongoose, { Schema, type Document } from 'mongoose';

export type NotificationType =
  | 'booking_confirmed'
  | 'session_reminder_24h'
  | 'session_reminder_2h'
  | 'session_reminder_10m'
  | 'session_rescheduled'
  | 'session_cancelled'
  | 'session_no_show'
  | 'system';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey?: string;
  referenceType?: string;
  referenceId?: string;
  readAt?: Date;
  emailSent: boolean;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'booking_confirmed',
        'session_reminder_24h',
        'session_reminder_2h',
        'session_reminder_10m',
        'session_rescheduled',
        'session_cancelled',
        'session_no_show',
        'system',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    dedupeKey: { type: String },
    referenceType: { type: String },
    referenceId: { type: String },
    readAt: { type: Date },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $exists: true } } },
);

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
