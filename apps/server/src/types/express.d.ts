import type { AuthUser } from '../middleware/auth.js';

declare global {
  namespace Express {
    interface Request {
      /** authenticate 中间件注入的当前登录用户 */
      user?: AuthUser;
    }
  }
}

export {};
