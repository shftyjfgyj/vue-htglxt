import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/http.js';
import { AppError } from '../../common/errors.js';
import { listMenusFor } from './menu.service.js';

const router = Router();

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    return ok(res, await listMenusFor(req.user));
  })
);

export default router;
