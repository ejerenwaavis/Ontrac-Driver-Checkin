import { Router } from 'express';
import { body } from 'express-validator';
import {
  getDrivers,
  getDriver,
  updateDriverStatus,
  uploadDrivers,
  uploadMiddleware,
  getProviders,
  getRosterSnapshots,
} from '../controllers/driverController.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);

// Available to admin + supervisor
router.get('/', authorize('admin', 'supervisor'), getDrivers);
router.get('/providers', authorize('admin', 'supervisor'), getProviders);
router.get('/roster-snapshots', authorize('admin', 'supervisor'), getRosterSnapshots);
router.get('/:id', authorize('admin', 'supervisor'), getDriver);

// Admin only
router.patch('/:id/status', authorize('admin'), [
  body('status').isIn(['active', 'inactive']).withMessage('Status must be active or inactive'),
], updateDriverStatus);

router.post(
  '/upload',
  authorize('admin'),
  (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  uploadDrivers
);

export default router;
