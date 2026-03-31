import { Router } from 'express';
import { body } from 'express-validator';
import {
  createInvite,
  listInvites,
  revokeInvite,
  validateToken,
  registerPhoto,
  photoUploadMiddleware,
} from '../controllers/inviteController.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';

const router = Router();

// ── Public routes (no auth) ───────────────────────────────────────────────────
router.get('/:token/validate', validateToken);

router.post(
  '/:token/register',
  (req, res, next) => {
    photoUploadMiddleware(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  registerPhoto
);

// ── Protected routes ──────────────────────────────────────────────────────────
router.use(authenticate);

router.get('/', authorize('admin', 'supervisor'), listInvites);

router.post(
  '/',
  authorize('admin', 'supervisor'),
  [
    body('teamName').trim().notEmpty().withMessage('Team name is required').isLength({ max: 100 }),
    body('type').optional().isIn(['team', 'reregister']).withMessage('type must be team or reregister'),
    body('expiresInDays').optional().isInt({ min: 1, max: 365 }).withMessage('expiresInDays must be 1–365'),
    body('lockedDriverNumber').optional().trim(),
  ],
  createInvite
);

router.delete('/:id', authorize('admin', 'supervisor'), revokeInvite);

export default router;
