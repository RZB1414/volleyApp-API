import { Router } from 'express';

import { getCurrentUser, login, register, updateProfile } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getCurrentUser);
router.patch('/me', authenticate, updateProfile);

export default router;
