import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import User from '../models/User.js';
import { generateSecret, generateOtpUri, generateQRCodeDataUrl, verifyTotp } from '../utils/mfa.js';
import { createAuditLog, getClientIp, getUserAgent } from '../middleware/auditLog.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const TEMP_TOKEN_EXPIRY = '10m'; // used during MFA setup/verification flow

const signAccessToken = (userId, role) =>
  jwt.sign({ userId, role, type: 'access' }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });

const signRefreshToken = (userId) =>
  jwt.sign({ userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

const signTempToken = (userId, purpose) =>
  jwt.sign({ userId, purpose, type: 'temp' }, process.env.JWT_SECRET, { expiresIn: TEMP_TOKEN_EXPIRY });

// ── POST /api/auth/login ──────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password +mfaSecret +refreshTokenHash'
    );

    if (!user || !user.isActive) {
      await createAuditLog('LOGIN_FAILED', { userEmail: email, details: { reason: 'user_not_found' }, ipAddress: ip, userAgent: ua });
      // Constant-time response to prevent user enumeration
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      await createAuditLog('LOGIN_FAILED', { userId: user._id, userEmail: user.email, details: { reason: 'bad_password' }, ipAddress: ip, userAgent: ua });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // MFA Setup required (first login or mfaEnabled is false)
    if (!user.mfaEnabled) {
      const tempToken = signTempToken(user._id, 'mfa_setup');
      return res.json({ success: true, requiresMFASetup: true, tempToken });
    }

    // MFA verification required
    const tempToken = signTempToken(user._id, 'mfa_verify');
    return res.json({ success: true, requiresMFA: true, tempToken });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/setup-mfa ──────────────────────────────────────────────────
export const setupMfa = async (req, res, next) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.body.tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    if (payload.purpose !== 'mfa_setup') {
      return res.status(401).json({ success: false, message: 'Invalid token purpose' });
    }

    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const secret = generateSecret();
    const otpUri = generateOtpUri(secret, user.email);
    const qrCodeDataUrl = await generateQRCodeDataUrl(otpUri);

    // Store secret temporarily (will be confirmed in confirmMfa)
    user.mfaSecret = secret;
    await user.save();

    return res.json({ success: true, qrCode: qrCodeDataUrl, secret, tempToken: req.body.tempToken });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/confirm-mfa ────────────────────────────────────────────────
export const confirmMfa = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    let payload;
    try {
      payload = jwt.verify(req.body.tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    if (payload.purpose !== 'mfa_setup') {
      return res.status(401).json({ success: false, message: 'Invalid token purpose' });
    }

    const user = await User.findById(payload.userId).select('+mfaSecret');
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { totpCode } = req.body;
    if (!verifyTotp(totpCode, user.mfaSecret)) {
      return res.status(400).json({ success: false, message: 'Invalid authenticator code. Please try again.' });
    }

    // Enable MFA
    user.mfaEnabled = true;
    const refreshToken = signRefreshToken(user._id);
    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    user.lastLogin = new Date();
    user.lastLoginIp = getClientIp(req);
    await user.save();

    await createAuditLog('MFA_SETUP', {
      userId: user._id, userEmail: user.email, userRole: user.role,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    const accessToken = signAccessToken(user._id, user.role);
    return res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        forcePasswordChange: user.forcePasswordChange || false,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/verify-mfa ─────────────────────────────────────────────────
export const verifyMfa = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    let payload;
    try {
      payload = jwt.verify(req.body.tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    if (payload.purpose !== 'mfa_verify') {
      return res.status(401).json({ success: false, message: 'Invalid token purpose' });
    }

    const user = await User.findById(payload.userId).select('+mfaSecret');
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!verifyTotp(req.body.totpCode, user.mfaSecret)) {
      await createAuditLog('LOGIN_FAILED', {
        userId: user._id, userEmail: user.email,
        details: { reason: 'bad_totp' }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      });
      return res.status(400).json({ success: false, message: 'Invalid authenticator code. Please try again.' });
    }

    const refreshToken = signRefreshToken(user._id);
    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    user.lastLogin = new Date();
    user.lastLoginIp = getClientIp(req);
    await user.save();

    await createAuditLog('LOGIN_SUCCESS', {
      userId: user._id, userEmail: user.email, userRole: user.role,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });
    await createAuditLog('MFA_VERIFIED', {
      userId: user._id, userEmail: user.email, userRole: user.role,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    const accessToken = signAccessToken(user._id, user.role);
    return res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        forcePasswordChange: user.forcePasswordChange || false,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
    if (payload.type !== 'refresh') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const user = await User.findById(payload.userId).select('+refreshTokenHash');
    if (!user || !user.isActive || !user.refreshTokenHash) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }

    const tokenValid = await bcrypt.compare(token, user.refreshTokenHash);
    if (!tokenValid) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }

    // Rotate refresh token
    const newRefreshToken = signRefreshToken(user._id);
    user.refreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    await user.save();

    await createAuditLog('TOKEN_REFRESHED', { userId: user._id, userEmail: user.email, userRole: user.role });

    const accessToken = signAccessToken(user._id, user.role);
    return res.json({ success: true, accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
export const logout = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.refreshTokenHash = undefined;
      await user.save();
    }
    await createAuditLog('LOGOUT', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  return res.json({ success: true, user: req.user });
};

// ── POST /api/auth/change-password ───────────────────────────────────────────
export const changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const match = await user.comparePassword(currentPassword);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must differ from current password' });
    }

    user.password = newPassword;
    user.forcePasswordChange = false;
    await user.save();

    await createAuditLog('PASSWORD_CHANGED', {
      userId: user._id, userEmail: user.email, userRole: user.role,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};
