import type { ClientSession } from 'mongoose';
import { getMailProvider } from '../../mail/mail.provider.js';
import { AppError } from '../../../middleware/errorHandler.js';
import { User } from '../../users/models/user.model.js';
import { emitToUser } from '../../../realtime/bus.js';
import { Notification, type NotificationType } from '../models/notification.model.js';

export interface NotifyUserInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey?: string;
  referenceType?: string;
  referenceId?: string;
  sendEmail?: boolean;
}

export async function notifyUser(
  input: NotifyUserInput,
  session?: ClientSession | null,
): Promise<{ created: boolean; notificationId?: string }> {
  try {
    const [created] = await Notification.create(
      [
        {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          dedupeKey: input.dedupeKey,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          emailSent: false,
        },
      ],
      session ? { session } : undefined,
    );

    if (!session) {
      await dispatchNotificationSideEffects(String(created._id), input);
    }

    return { created: true, notificationId: String(created._id) };
  } catch (err) {
    const code = typeof err === 'object' && err !== null ? (err as { code?: number }).code : undefined;
    if (code === 11000 && input.dedupeKey) {
      return { created: false };
    }
    throw err;
  }
}

export async function dispatchNotificationSideEffects(
  notificationId: string,
  input: NotifyUserInput,
): Promise<void> {
  emitToUser(input.userId, 'notification:new', {
    id: notificationId,
    type: input.type,
    title: input.title,
    body: input.body,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    createdAt: new Date().toISOString(),
  });

  if (input.sendEmail) {
    const user = await User.findById(input.userId).select('email fullName').lean();
    if (user?.email) {
      const sent = await getMailProvider().sendMail({
        to: user.email,
        subject: `[WebEnglish 1-1] ${input.title}`,
        text: `${input.title}\n\n${input.body}`,
      });
      if (sent.delivered) {
        await Notification.updateOne({ _id: notificationId }, { $set: { emailSent: true } });
      }
    }
  }
}

export async function listNotificationsForUser(
  userId: string,
  query: { page?: number; limit?: number },
) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 30)));

  const [items, total, unreadCount] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, readAt: { $exists: false } }),
  ]);

  return {
    unreadCount,
    items: items.map((n) => ({
      id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      referenceType: n.referenceType,
      referenceId: n.referenceId,
      readAt: n.readAt,
      emailSent: n.emailSent,
    })),
    meta: { page, limit, total },
  };
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();

  if (!updated) {
    throw new AppError(404, 'NOT_FOUND', 'Notification not found');
  }

  return {
    id: String(updated._id),
    readAt: updated.readAt,
  };
}

export async function markAllNotificationsRead(userId: string) {
  const res = await Notification.updateMany(
    { userId, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  );
  return { markedCount: res.modifiedCount };
}
