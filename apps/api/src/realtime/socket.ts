import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import type { UserRole } from '@webenglish/shared';
import {
  CreateQuickNoteSchema,
  SessionChatMessageSchema,
  UpdateSharedNotesSchema,
} from '@webenglish/shared';
import { env } from '../config/env.js';
import { loadAuthenticatedUser } from '../middleware/auth.js';
import {
  addClassroomChatMessage,
  addClassroomQuickNote,
  joinClassroom,
  recordClassroomLeave,
  updateClassroomSharedNotes,
} from '../modules/sessions/services/classroom.service.js';
import { setSocketServer } from './bus.js';

interface SocketUserData {
  id: string;
  role: UserRole;
  fullName: string;
  activeSessionId?: string;
}

function getSocketUser(socket: Socket): SocketUserData | undefined {
  return (socket.data as { user?: SocketUserData }).user;
}

function extractToken(socket: Socket): string | undefined {
  const authToken = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return undefined;
}

export function attachSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  setSocketServer(io);

  io.use(async (socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      return next(new Error('UNAUTHORIZED'));
    }
    const auth = await loadAuthenticatedUser(token);
    if (!auth.ok) {
      return next(new Error(auth.code));
    }
    (socket.data as { user: SocketUserData }).user = {
      id: auth.user.id,
      role: auth.user.role,
      fullName: auth.user.fullName,
    };
    return next();
  });

  io.on('connection', (socket) => {
    const user = getSocketUser(socket);
    if (!user) {
      socket.disconnect(true);
      return;
    }

    void socket.join(`user:${user.id}`);

    socket.on(
      'classroom:join',
      async (payload: { sessionId?: string }, ack?: (res: Record<string, unknown>) => void) => {
        try {
          if (!payload?.sessionId) {
            ack?.({ ok: false, error: 'VALIDATION_ERROR' });
            return;
          }
          const state = await joinClassroom(payload.sessionId, {
            id: user.id,
            role: user.role,
          });
          user.activeSessionId = payload.sessionId;
          const room = `classroom:${payload.sessionId}`;
          await socket.join(room);
          socket.emit('classroom:state', state);
          socket.to(room).emit('classroom:participant-joined', {
            userId: user.id,
            role: user.role,
            fullName: user.fullName,
          });
          ack?.({ ok: true, state });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unable to join classroom';
          const code =
            typeof err === 'object' && err !== null && 'code' in err
              ? String((err as { code: unknown }).code)
              : 'FORBIDDEN';
          ack?.({ ok: false, code, message });
        }
      },
    );

    socket.on(
      'classroom:notes:update',
      async (
        payload: { sessionId?: string; content?: string },
        ack?: (res: Record<string, unknown>) => void,
      ) => {
        try {
          if (!payload?.sessionId || typeof payload.content !== 'string') {
            ack?.({ ok: false, error: 'VALIDATION_ERROR' });
            return;
          }
          const parsed = UpdateSharedNotesSchema.parse({ content: payload.content });
          const updated = await updateClassroomSharedNotes(payload.sessionId, parsed.content, {
            id: user.id,
            role: user.role,
          });
          io.to(`classroom:${payload.sessionId}`).emit('classroom:notes:updated', {
            sessionId: payload.sessionId,
            sharedNotes: updated.sharedNotes,
            updatedBy: user.id,
          });
          ack?.({ ok: true });
        } catch (err) {
          ack?.({ ok: false, message: err instanceof Error ? err.message : 'Failed to update notes' });
        }
      },
    );

    socket.on(
      'classroom:quick-note:add',
      async (
        payload: { sessionId?: string; kind?: string; term?: string; correction?: string; contextNote?: string },
        ack?: (res: Record<string, unknown>) => void,
      ) => {
        try {
          if (!payload?.sessionId) {
            ack?.({ ok: false, error: 'VALIDATION_ERROR' });
            return;
          }
          const parsed = CreateQuickNoteSchema.parse(payload);
          const note = await addClassroomQuickNote(payload.sessionId, parsed, {
            id: user.id,
            role: user.role,
          });
          io.to(`classroom:${payload.sessionId}`).emit('classroom:quick-note:added', {
            sessionId: payload.sessionId,
            note,
          });
          ack?.({ ok: true, note });
        } catch (err) {
          ack?.({ ok: false, message: err instanceof Error ? err.message : 'Failed to add quick note' });
        }
      },
    );

    socket.on(
      'classroom:chat:send',
      async (
        payload: { sessionId?: string; text?: string },
        ack?: (res: Record<string, unknown>) => void,
      ) => {
        try {
          if (!payload?.sessionId || typeof payload.text !== 'string') {
            ack?.({ ok: false, error: 'VALIDATION_ERROR' });
            return;
          }
          const parsed = SessionChatMessageSchema.parse({ text: payload.text });
          const msg = await addClassroomChatMessage(payload.sessionId, parsed.text, {
            id: user.id,
            role: user.role,
            fullName: user.fullName,
          });
          io.to(`classroom:${payload.sessionId}`).emit('classroom:chat:message', {
            sessionId: payload.sessionId,
            message: msg,
          });
          ack?.({ ok: true, message: msg });
        } catch (err) {
          ack?.({ ok: false, message: err instanceof Error ? err.message : 'Failed to send chat' });
        }
      },
    );

    socket.on('disconnect', () => {
      if (user.activeSessionId) {
        void recordClassroomLeave(user.activeSessionId, { id: user.id, role: user.role });
      }
    });
  });

  return io;
}
