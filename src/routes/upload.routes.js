import { Router } from 'express';

import {
  cancelMultipartUpload,
  createMultipartUpload,
  finalizeMultipartUpload,
  listIncompleteUploads
} from '../controllers/upload.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/multipart', authenticate, createMultipartUpload);
router.post('/multipart/complete', authenticate, finalizeMultipartUpload);
router.post('/multipart/cancel', authenticate, cancelMultipartUpload);
router.get('/multipart/pending', authenticate, listIncompleteUploads);

export default router;
