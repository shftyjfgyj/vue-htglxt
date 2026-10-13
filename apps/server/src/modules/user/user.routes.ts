import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../common/audit.js';
import { imageUpload } from '../upload/upload.middleware.js';
import * as controller from './user.controller.js';
import { CreateUserSchema, IdParamSchema, ListUserQuerySchema, ResetPasswordSchema, SetStatusSchema, SetTrustSchema, SetUserRolesSchema, UpdateUserSchema } from './user.schema.js';

const router = Router();

router.use(authenticate);

// 个人中心（任何登录用户）
router.put('/me', validate({ body: UpdateUserSchema }), audit({ module: 'user', action: 'update_me', withBody: true }), controller.updateMe);
router.post('/me/avatar', imageUpload('file'), audit({ module: 'user', action: 'update_avatar' }), controller.updateAvatar);

// 用户管理（需要权限点）
router.get('/', requirePermission('user:list'), validate({ query: ListUserQuerySchema }), controller.list);
router.post('/', requirePermission('user:create'), validate({ body: CreateUserSchema }), audit({ module: 'user', action: 'create', withBody: true }), controller.create);
router.get('/:id', requirePermission('user:detail', 'user:list'), validate({ params: IdParamSchema }), controller.detail);
router.put('/:id', requirePermission('user:update'), validate({ params: IdParamSchema, body: UpdateUserSchema }), audit({ module: 'user', action: 'update', target: (req) => `user:${req.params.id}`, withBody: true }), controller.update);
router.put('/:id/status', requirePermission('user:status'), validate({ params: IdParamSchema, body: SetStatusSchema }), audit({ module: 'user', action: 'set_status', target: (req) => `user:${req.params.id}`, withBody: true }), controller.setStatus);
router.put('/:id/password', requirePermission('user:resetPwd'), validate({ params: IdParamSchema, body: ResetPasswordSchema }), audit({ module: 'user', action: 'reset_password', target: (req) => `user:${req.params.id}` }), controller.resetPassword);
router.delete('/:id', requirePermission('user:delete'), validate({ params: IdParamSchema }), audit({ module: 'user', action: 'delete', target: (req) => `user:${req.params.id}` }), controller.remove);

// 信任设置：强制可信 / 清除违规记录（自动审核的运营开关）
router.put(
  '/:id/trust',
  requirePermission('user:update'),
  validate({ params: IdParamSchema, body: SetTrustSchema }),
  audit({ module: 'user', action: 'set_trust', target: (req) => `user:${req.params.id}`, withBody: true }),
  controller.setTrust
);

// 用户-角色（归入角色权限点）
router.get('/:id/roles', requirePermission('role:list'), validate({ params: IdParamSchema }), controller.getMyRoles);
router.put('/:id/roles', requirePermission('role:assignUser'), validate({ params: IdParamSchema, body: SetUserRolesSchema }), audit({ module: 'role', action: 'assign_user_roles', target: (req) => `user:${req.params.id}`, withBody: true }), controller.assignRoles);

export default router;
