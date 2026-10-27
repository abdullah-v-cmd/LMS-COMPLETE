import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validateRequest } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimit';
import { loginSchema, refreshTokenSchema, changePasswordSchema, updateProfileSchema } from './auth.schemas';

const router = Router();

router.post('/login', authRateLimiter, validateRequest({ body: loginSchema }), AuthController.login);
router.post('/refresh', validateRequest({ body: refreshTokenSchema }), AuthController.refresh);
router.post('/logout', requireAuth, AuthController.logout);
router.get('/me', requireAuth, AuthController.getMe);
router.post('/change-password', requireAuth, validateRequest({ body: changePasswordSchema }), AuthController.changePassword);
router.patch('/profile', requireAuth, validateRequest({ body: updateProfileSchema }), AuthController.updateProfile);

export default router;
