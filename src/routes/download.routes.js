import { Router } from 'express';

import { generateDownloadLink, useDownloadLink } from '../controllers/download.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/generate', authenticate, generateDownloadLink);
router.get('/use/:token', useDownloadLink);

export default router;
