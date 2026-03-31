import { Router } from 'express';
import { body } from 'express-validator';
import {
  login,
  setupMfa,
  confirmMfa,
  verifyMfa,
  refreshToken,
  logout,
  getMe,
  changePassword,
} from '../controllers/authController.js';
import authenticate from '../middleware/authenticate.js';

const router = Router();

// Validation rules
const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

const totpRules = [
  body('totpCode').isLength({ min: 6, max: 6 }).isNumeric().withMessage('6-digit code required'),
  body('tempToken').notEmpty().withMessage('Token required'),
];

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword')
    .isLength({ min: 12 })
    .withMessage('New password must be at least 12 characters'),
];

router.post('/login', loginRules, login);
router.post('/setup-mfa', setupMfa);
router.post('/confirm-mfa', totpRules, confirmMfa);
router.post('/verify-mfa', totpRules, verifyMfa);
router.post('/refresh', refreshToken);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/change-password', authenticate, changePasswordRules, changePassword);

export default router;
