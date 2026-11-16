import type { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function setSocketServer(io: Server | null): void {
  ioInstance = io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
}
