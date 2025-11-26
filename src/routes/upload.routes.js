import { Router } from 'express';

import {
  cancelMultipartUpload,
  createMultipartUpload,
  finalizeMultipartUpload,
  listCompletedUploads,
  listIncompleteUploads
} from '../controllers/upload.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/multipart', authenticate, createMultipartUpload);
router.post('/multipart/complete', authenticate, finalizeMultipartUpload);
router.post('/multipart/cancel', authenticate, cancelMultipartUpload);
router.delete('/multipart/pending/:uploadId', authenticate, cancelMultipartUpload);
router.get('/multipart/pending', authenticate, listIncompleteUploads);
router.get('/multipart/completed', authenticate, listCompletedUploads);

export default router;
