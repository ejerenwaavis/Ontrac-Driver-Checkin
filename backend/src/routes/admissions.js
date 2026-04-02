import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  lookupDriver,
  scanDriver,
  checkoutDriver,
  supervisorOverride,
  getAdmissions,
  getAdmissionStats,
  getAdmissionAnalytics,
} from '../controllers/admissionController.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);

router.post(
  '/lookup',
  [body('driverNumber').trim().notEmpty().withMessage('Driver number required')],
  lookupDriver
);

router.post(
  '/scan',
  [
    body('driverNumber').trim().notEmpty().withMessage('Driver number required'),
    body('source').optional().isIn(['scan', 'manual']).withMessage('Invalid source'),
  ],
  scanDriver
);

router.post(
  '/checkout',
  [
    body('driverNumber').trim().notEmpty().withMessage('Driver number required'),
    body('source').optional().isIn(['scan', 'manual']).withMessage('Invalid source'),
  ],
  checkoutDriver
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
router.get(
  '/analytics',
  authorize('admin', 'supervisor'),
  [
    query('startDate').optional().isISO8601().withMessage('startDate must be YYYY-MM-DD'),
    query('endDate').optional().isISO8601().withMessage('endDate must be YYYY-MM-DD'),
  ],
  getAdmissionAnalytics
);
router.get('/', authorize('admin', 'supervisor'), getAdmissions);

export default router;
