import { Router } from 'express';

import {
  createMatchReport,
  getMatchReport,
  listMatchReportsController
} from '../controllers/stats.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/match-report', authenticate, createMatchReport);
router.get('/match-report', listMatchReportsController);
router.get('/match-report/:matchId', getMatchReport);

export default router;
