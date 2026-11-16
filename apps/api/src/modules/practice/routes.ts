import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js';
import {
  createCustomCardController,
  getDeckController,
  getSrsQueueController,
  listAttemptsController,
  listDecksController,
  listIpaController,
  listMediaLessonsController,
  reviewAttemptController,
  reviewSrsCardController,
  submitDictationController,
  submitShadowingController,
  syncSessionVocabController,
  toggleStarCardController,
} from './controllers/practice.controller.js';

const router = Router();

/**
 * @openapi
 * /practice/decks:
 *   get:
 *     tags: [Practice]
 *     summary: Danh sách bộ từ vựng CEFR/IELTS/Business và bộ thẻ cá nhân từ buổi học 1-1
 *     responses:
 *       200:
 *         description: Danh sách bộ thẻ
 */
router.get('/decks', optionalAuth, listDecksController);
router.get('/decks/:id', optionalAuth, getDeckController);
router.get('/srs/queue', requireAuth, getSrsQueueController);
router.post('/srs/review', requireAuth, requireRole('student'), reviewSrsCardController);
router.patch('/cards/:cardId/star', requireAuth, requireRole('student'), toggleStarCardController);
router.post('/cards', requireAuth, requireRole('student'), createCustomCardController);
router.post('/sync-session-vocab', requireAuth, requireRole('student'), syncSessionVocabController);

/**
 * @openapi
 * /practice/ipa:
 *   get:
 *     tags: [Practice]
 *     summary: Bảng 44 âm IPA chuẩn kèm mẹo phát âm cho người Việt và từ ví dụ
 *     responses:
 *       200:
 *         description: Danh sách 44 âm IPA
 */
router.get('/ipa', optionalAuth, listIpaController);

/**
 * @openapi
 * /practice/media:
 *   get:
 *     tags: [Practice]
 *     summary: Kho bài nghe chép Dictation & Shadowing từ nguồn mở VOA Public Domain và British Council
 *     responses:
 *       200:
 *         description: Danh sách bài nghe tách theo từng câu
 */
router.get('/media', optionalAuth, listMediaLessonsController);
router.post('/dictation', requireAuth, requireRole('student'), submitDictationController);
router.post('/shadowing', requireAuth, requireRole('student'), submitShadowingController);
router.get('/attempts', requireAuth, listAttemptsController);
router.post('/attempts/:id/review', requireAuth, reviewAttemptController);

export default router;
