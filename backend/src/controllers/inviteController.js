import { v4 as uuidv4 } from 'uuid';
import { validationResult } from 'express-validator';
import multer from 'multer';
import TeamInvite from '../models/TeamInvite.js';
import Driver from '../models/Driver.js';
import { uploadDriverPhoto } from '../utils/cloudinary.js';
import { createAuditLog, getClientIp, getUserAgent } from '../middleware/auditLog.js';

// ── Multer: memory storage for photo uploads ──────────────────────────────────
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are accepted'));
    }
  },
});

export const photoUploadMiddleware = photoUpload.single('photo');

// ── POST /api/invite — create invite (protected) ──────────────────────────────
export const createInvite = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { teamName, expiresInDays = 30, type = 'team', lockedDriverNumber } = req.body;

    if (type === 'reregister') {
      if (!lockedDriverNumber) {
        return res.status(400).json({ success: false, message: 'lockedDriverNumber is required for reregister invites' });
      }
      const driver = await Driver.findOne({ driverNumber: String(lockedDriverNumber).trim().toUpperCase() });
      if (!driver) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(expiresInDays));

    const invite = await TeamInvite.create({
      token: uuidv4(),
      type,
      teamName: teamName.trim(),
      lockedDriverNumber: type === 'reregister' ? String(lockedDriverNumber).trim().toUpperCase() : null,
      createdBy: req.user._id,
      createdByName: req.user.name,
      expiresAt,
    });

    await createAuditLog('INVITE_CREATED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'TeamInvite', resourceId: invite._id.toString(),
      details: { type, teamName, lockedDriverNumber: invite.lockedDriverNumber, expiresAt },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.status(201).json({ success: true, invite });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/invite — list invites (protected) ────────────────────────────────
export const listInvites = async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { createdBy: req.user._id };
    const invites = await TeamInvite.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, invites });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/invite/:id — revoke invite (protected) ───────────────────────
export const revokeInvite = async (req, res, next) => {
  try {
    const invite = await TeamInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ success: false, message: 'Invite not found' });

    // Supervisors can only revoke their own invites
    if (req.user.role !== 'admin' && String(invite.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorised to revoke this invite' });
    }

    invite.active = false;
    await invite.save();

    await createAuditLog('INVITE_REVOKED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'TeamInvite', resourceId: invite._id.toString(),
      details: { type: invite.type, teamName: invite.teamName },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, message: 'Invite revoked' });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/invite/:token/validate — validate token (public) ─────────────────
export const validateToken = async (req, res, next) => {
  try {
    const invite = await TeamInvite.findOne({ token: req.params.token });

    if (!invite || !invite.active || invite.expiresAt < new Date()) {
      return res.json({ valid: false, reason: 'This invite link is invalid or has expired.' });
    }

    return res.json({
      valid: true,
      teamName: invite.teamName,
      type: invite.type,
      lockedDriverNumber: invite.lockedDriverNumber,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/invite/:token/register — upload photo (public) ──────────────────
export const registerPhoto = async (req, res, next) => {
  try {
    const invite = await TeamInvite.findOne({ token: req.params.token });

    if (!invite || !invite.active || invite.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'This invite link is invalid or has expired.' });
    }

    const rawNumber = req.body.driverNumber;
    if (!rawNumber) {
      return res.status(400).json({ success: false, message: 'Driver number is required.' });
    }
    const driverNumber = String(rawNumber).trim().toUpperCase();

    // Enforce locked driver number for reregister invites
    if (invite.type === 'reregister' && invite.lockedDriverNumber !== driverNumber) {
      return res.status(403).json({ success: false, message: 'This link is not valid for that driver number.' });
    }

    const driver = await Driver.findOne({ driverNumber });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver number not found in system.' });
    }

    // Only active drivers may register a photo
    if (driver.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'This driver account is currently inactive. Only active drivers can register a photo. Please contact your supervisor.',
        inactive: true,
      });
    }

    // Block re-registration on regular team invites when photo already exists
    if (invite.type === 'team' && driver.photoUrl) {
      return res.status(409).json({
        success: false,
        message: 'A photo is already registered for this driver. A supervisor must issue a re-registration link to update it.',
        alreadyRegistered: true,
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'A photo file is required.' });
    }

    const { url } = await uploadDriverPhoto(req.file.buffer, req.file.mimetype, driverNumber);

    driver.photoUrl = url;
    await driver.save();

    invite.timesUsed += 1;
    // Reregister invites are single-use — self-revoke after use
    if (invite.type === 'reregister') {
      invite.active = false;
    }
    await invite.save();

    await createAuditLog('DRIVER_PHOTO_UPLOADED', {
      userId: null,
      userEmail: `invite:${invite.token.slice(0, 8)}`,
      userRole: 'invite',
      resource: 'Driver', resourceId: driver._id.toString(),
      details: { driverNumber, teamName: invite.teamName, inviteType: invite.type },
      ipAddress: req.ip, userAgent: req.headers['user-agent'] || '',
    });

    return res.json({ success: true, driverName: driver.name, photoUrl: url });
  } catch (err) {
    next(err);
  }
};
