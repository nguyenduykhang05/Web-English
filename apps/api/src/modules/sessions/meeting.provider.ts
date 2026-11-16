import { randomBytes } from 'crypto';
import type { MeetingProvider as MeetingProviderKind } from '@webenglish/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';

export interface CreateRoomRequest {
  sessionId: string;
  title: string;
  manualJoinUrl?: string;
}

export interface CreateRoomResult {
  provider: MeetingProviderKind;
  roomCode: string;
  joinUrl: string;
}

export interface MeetingProvider {
  readonly name: MeetingProviderKind;
  createRoom(input: CreateRoomRequest): Promise<CreateRoomResult>;
}

export class JitsiMeetingProvider implements MeetingProvider {
  readonly name = 'jitsi' as const;

  async createRoom(input: CreateRoomRequest): Promise<CreateRoomResult> {
    const entropy = randomBytes(4).toString('hex');
    const shortId = input.sessionId.slice(-6).replace(/[^a-zA-Z0-9]/g, '');
    const roomCode = `webenglish-${shortId}-${entropy}`;
    const joinUrl = `https://${env.JITSI_DOMAIN}/${roomCode}`;
    return {
      provider: 'jitsi',
      roomCode,
      joinUrl,
    };
  }
}

export class ManualLinkMeetingProvider implements MeetingProvider {
  readonly name = 'manual_link' as const;

  async createRoom(input: CreateRoomRequest): Promise<CreateRoomResult> {
    const url = input.manualJoinUrl?.trim();
    if (!url) {
      throw new AppError(400, 'VALIDATION_ERROR', 'manualJoinUrl is required for manual_link provider');
    }
    return {
      provider: 'manual_link',
      roomCode: `manual-${input.sessionId.slice(-8)}`,
      joinUrl: url,
    };
  }
}

const jitsiProvider = new JitsiMeetingProvider();
const manualLinkProvider = new ManualLinkMeetingProvider();

export function getMeetingProvider(kind: MeetingProviderKind = 'jitsi'): MeetingProvider {
  return kind === 'manual_link' ? manualLinkProvider : jitsiProvider;
}
