import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../common/audit.js';
import * as controller from './role.controller.js';
import { CreateRoleSchema, RoleIdParamSchema, SetPermissionsSchema, UpdateRoleSchema } from './role.schema.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('role:list'), controller.list);
router.get('/permissions/all', requirePermission('role:list'), controller.listAllPermissions);
router.post('/', requirePermission('role:create'), validate({ body: CreateRoleSchema }), audit({ module: 'role', action: 'create', withBody: true }), controller.create);
router.get('/:id', requirePermission('role:list'), validate({ params: RoleIdParamSchema }), controller.detail);
router.put('/:id', requirePermission('role:update'), validate({ params: RoleIdParamSchema, body: UpdateRoleSchema }), audit({ module: 'role', action: 'update', target: (req) => `role:${req.params.id}`, withBody: true }), controller.update);
router.delete('/:id', requirePermission('role:delete'), validate({ params: RoleIdParamSchema }), audit({ module: 'role', action: 'delete', target: (req) => `role:${req.params.id}` }), controller.remove);
router.get('/:id/permissions', requirePermission('role:list'), validate({ params: RoleIdParamSchema }), controller.getPermissions);
router.put('/:id/permissions', requirePermission('role:assignPerm'), validate({ params: RoleIdParamSchema, body: SetPermissionsSchema }), audit({ module: 'role', action: 'set_permissions', target: (req) => `role:${req.params.id}`, withBody: true }), controller.setPermissions);

export default router;
