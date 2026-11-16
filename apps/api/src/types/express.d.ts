import type { Logger } from 'pino';
import type { UserRole } from '@webenglish/shared';

export interface AuthUserContext {
  id: string;
  role: UserRole;
  email: string;
  fullName: string;
  timezone: string;
  locale: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      log?: Logger;
      user?: AuthUserContext;
    }
  }
}

export {};
