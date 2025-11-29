import { Router } from 'express';

import {
  createMatchReport,
  getMatchReport,
  listMatchReportsController
} from '../controllers/stats.controller.js';

const router = Router();

router.post('/match-report', createMatchReport);
router.get('/match-report', listMatchReportsController);
router.get('/match-report/:matchId', getMatchReport);

export default router;
