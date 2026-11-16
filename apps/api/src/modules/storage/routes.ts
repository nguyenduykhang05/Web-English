import express, { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { sanitizeNoSqlInput } from '../../middleware/sanitize.js';
import { MAX_UPLOAD_BYTES } from './storage.service.js';
import { downloadFileController, uploadFileController } from './controllers/storage.controller.js';

const router = Router();

router.post(
  '/upload',
  requireAuth,
  express.raw({
    limit: MAX_UPLOAD_BYTES + 1024,
    type: ['image/*', 'audio/*', 'application/pdf', 'application/octet-stream'],
  }),
  express.json({ limit: '8mb' }),
  sanitizeNoSqlInput,
  uploadFileController,
);

router.get('/files/:folder/:filename', requireAuth, downloadFileController);

export default router;
