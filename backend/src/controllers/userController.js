import { validationResult } from 'express-validator';
import User from '../models/User.js';
import { createAuditLog, getClientIp, getUserAgent } from '../middleware/auditLog.js';

// ── GET /api/users ────────────────────────────────────────────────────────────
export const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, role, isActive } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      User.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      users,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/users ───────────────────────────────────────────────────────────
export const createUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: role || 'clerk',
      createdBy: req.user._id,
    });

    await createAuditLog('USER_CREATED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'User', resourceId: user._id.toString(),
      details: { name: user.name, email: user.email, role: user.role },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.status(201).json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/users/:id ──────────────────────────────────────────────────────
export const updateUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // Prevent self-deactivation or self-role-change
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot modify your own account here' });
    }

    const allowed = ['name', 'role'];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await createAuditLog('USER_UPDATED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'User', resourceId: user._id.toString(),
      details: updates, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/users/:id/deactivate ──────────────────────────────────────────
export const deactivateUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false, refreshTokenHash: undefined },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await createAuditLog('USER_DEACTIVATED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'User', resourceId: user._id.toString(),
      details: { email: user.email }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, message: 'User deactivated', user });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/users/:id/activate ────────────────────────────────────────────
export const activateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await createAuditLog('USER_UPDATED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'User', resourceId: user._id.toString(),
      details: { action: 'reactivated', email: user.email },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, message: 'User reactivated', user });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/users/:id/reset-mfa ──────────────────────────────────────────
export const resetUserMfa = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot reset your own MFA from this screen' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        mfaEnabled: false,
        mfaSecret: undefined,
        refreshTokenHash: undefined,
      },
      { new: true }
    );

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await createAuditLog('USER_MFA_RESET', {
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      resource: 'User',
      resourceId: user._id.toString(),
      details: { email: user.email },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return res.json({
      success: true,
      message: 'MFA reset. User must set up MFA again on next login.',
      user,
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/users/:id ────────────────────────────────────────────────────
export const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.isActive) {
      return res.status(400).json({ success: false, message: 'User must be deactivated before deletion' });
    }

    await User.findByIdAndDelete(req.params.id);

    await createAuditLog('USER_DELETED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'User', resourceId: req.params.id,
      details: { name: user.name, email: user.email, role: user.role },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, message: 'User permanently deleted' });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/users/:id/reset-password ─────────────────────────────────────
export const resetPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Use the change-password endpoint for your own account' });
    }

    const { newPassword } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.password = newPassword;
    user.forcePasswordChange = true;
    user.refreshTokenHash = undefined;
    await user.save();

    await createAuditLog('PASSWORD_RESET_BY_ADMIN', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'User', resourceId: user._id.toString(),
      details: { targetEmail: user.email },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, message: 'Password reset. User must change it on next login.' });
  } catch (err) {
    next(err);
  }
};
