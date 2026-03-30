import { Router } from 'express';
import { body } from 'express-validator';
import { getUsers, createUser, updateUser, deactivateUser, activateUser } from '../controllers/userController.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(authenticate, authorize('admin'));

const createRules = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name required (2–100 chars)'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 12 }).withMessage('Password must be at least 12 characters'),
  body('role').isIn(['admin', 'supervisor', 'clerk']).withMessage('Role must be admin, supervisor, or clerk'),
];

const updateRules = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name 2–100 chars'),
  body('role').optional().isIn(['admin', 'supervisor', 'clerk']).withMessage('Invalid role'),
];

router.get('/', getUsers);
router.post('/', createRules, createUser);
router.patch('/:id', updateRules, updateUser);
router.patch('/:id/deactivate', deactivateUser);
router.patch('/:id/activate', activateUser);

export default router;
