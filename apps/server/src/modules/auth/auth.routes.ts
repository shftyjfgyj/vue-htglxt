import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { ChangePasswordSchema, LoginSchema, LogoutSchema, RefreshSchema } from './auth.schema.js';

const router = Router();

/**
 * 登录接口单独限流，抵御暴力破解。
 * 阈值可用 LOGIN_RATE_LIMIT 覆盖：E2E / 压测环境需要放宽，生产保持默认 20 次/10 分钟。
 */
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT ?? 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '登录尝试过于频繁，请 10 分钟后再试', data: null }
});

router.post('/login', loginLimiter, validate({ body: LoginSchema }), controller.login);
router.post('/refresh', validate({ body: RefreshSchema }), controller.refresh);
router.post('/logout', authenticate, validate({ body: LogoutSchema }), controller.logout);
router.get('/profile', authenticate, controller.profile);
router.put('/password', authenticate, validate({ body: ChangePasswordSchema }), controller.changePassword);

export default router;
