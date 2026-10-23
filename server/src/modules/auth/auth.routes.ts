import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validateRequest } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { loginSchema, refreshTokenSchema } from './auth.schemas';

const router = Router();

router.post('/login', validateRequest({ body: loginSchema }), AuthController.login);
router.post('/refresh', validateRequest({ body: refreshTokenSchema }), AuthController.refresh);
router.post('/logout', requireAuth, AuthController.logout);
router.get('/me', requireAuth, AuthController.getMe);

export default router;
