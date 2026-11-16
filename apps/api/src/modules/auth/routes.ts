import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.js';
import {
  acceptInviteController,
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  refreshController,
  registerController,
  resetPasswordController,
  verifyEmailController,
} from './controllers/auth.controller.js';

function createAuthRateLimiter(maxPerMinute: number, message: string) {
  return rateLimit({
    windowMs: 60_000,
    limit: maxPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message },
    },
  });
}

export function createAuthRoutes(): Router {
  const router = Router();

  const loginLimiter = createAuthRateLimiter(
    20,
    'Too many login attempts from this IP, please try again shortly',
  );
  const forgotPasswordLimiter = createAuthRateLimiter(
    5,
    'Too many password reset requests, please try again later',
  );
  const refreshLimiter = createAuthRateLimiter(
    20,
    'Too many token refresh attempts, please wait a moment',
  );

  /**
   * @openapi
   * /api/v1/auth/register:
   *   post:
   *     tags: [Auth]
   *     summary: Register a new student account
   *     responses:
   *       201:
   *         description: Student registered
   */
  router.post('/register', registerController);

  /**
   * @openapi
   * /api/v1/auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Login with email and password
   *     responses:
   *       200:
   *         description: Access token and user profile returned
   */
  router.post('/login', loginLimiter, loginController);

  router.post('/refresh', refreshLimiter, refreshController);
  router.post('/logout', logoutController);
  router.post('/verify-email', verifyEmailController);
  router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordController);
  router.post('/reset-password', resetPasswordController);
  router.post('/accept-invite', acceptInviteController);
  router.get('/me', requireAuth, meController);

  return router;
}

const defaultRouter = createAuthRoutes();
export default defaultRouter;
