import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  scanDriver,
  supervisorOverride,
  getAdmissions,
  getAdmissionStats,
} from '../controllers/admissionController.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);

router.post(
  '/scan',
  [
    body('driverNumber').trim().notEmpty().withMessage('Driver number required'),
    body('source').optional().isIn(['scan', 'manual']).withMessage('Invalid source'),
  ],
  scanDriver
);

router.post(
  '/override',
  [
    body('driverNumber').trim().notEmpty().withMessage('Driver number required'),
    body('supervisorEmail').isEmail().normalizeEmail().withMessage('Valid supervisor email required'),
    body('supervisorPassword').notEmpty().withMessage('Supervisor password required'),
    body('totpCode').isLength({ min: 6, max: 6 }).isNumeric().withMessage('6-digit TOTP code required'),
    body('overrideReason').trim().isLength({ min: 3, max: 500 }).withMessage('Override reason required (3–500 chars)'),
  ],
  supervisorOverride
);

router.get('/stats', authorize('admin', 'supervisor'), getAdmissionStats);
router.get('/', authorize('admin', 'supervisor'), getAdmissions);

export default router;
