import type { RequestHandler } from 'express';
import { AppError } from '../common/errors.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { getAuthUser, type AuthUser } from '../modules/auth/auth.service.js';

export type { AuthUser };

/** 校验 Bearer access token，并加载用户的角色与权限码 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization') ?? '';
    if (!header.toLowerCase().startsWith('bearer ')) {
      throw AppError.unauthorized('缺少 Authorization: Bearer <token> 请求头');
    }
    const token = header.slice(7).trim();
    if (!token) throw AppError.unauthorized('访问令牌为空');

    const payload = verifyAccessToken(token);
    const user = await getAuthUser(payload.sub);
    if (!user) throw AppError.unauthorized('账号不存在或已被停用');
    if (user.status !== 1) throw AppError.forbidden('账号已被停用，请联系管理员');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
