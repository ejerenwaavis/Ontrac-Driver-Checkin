import dayjs from 'dayjs';
import { validationResult } from 'express-validator';
import Driver from '../models/Driver.js';
import Admission from '../models/Admission.js';
import User from '../models/User.js';
import { createAuditLog, getClientIp, getUserAgent } from '../middleware/auditLog.js';
import { verifyTotp } from '../utils/mfa.js';
import bcrypt from 'bcryptjs';
import { getDriverPhotoUrl } from '../utils/ontracAdapter.js';

const todayKey = () => dayjs().format('YYYY-MM-DD');

// ── POST /api/admissions/lookup ───────────────────────────────────────────────
// Read-only — returns driver info + photo URL without recording any admission.
export const lookupDriver = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const driverNumber = String(req.body.driverNumber).trim().toUpperCase();

    const driver = await Driver.findOne({ driverNumber });

    if (!driver) {
      return res.json({
        success: true,
        result: 'NOT_FOUND',
        driverNumber,
        requiresOverride: true,
        message: 'Driver number not found in system',
      });
    }

    const photoUrl = await getDriverPhotoUrl(driverNumber, driver.photoUrl);

    if (driver.status !== 'active') {
      return res.json({
        success: true,
        result: 'INACTIVE',
        driverNumber,
        driverName: driver.name,
        regionalServiceProvider: driver.regionalServiceProvider,
        photoUrl,
        requiresOverride: true,
        message: 'Driver account is inactive',
      });
    }

    return res.json({
      success: true,
      result: 'FOUND',
      driverNumber,
      driverName: driver.name,
      regionalServiceProvider: driver.regionalServiceProvider,
      photoUrl,
      requiresOverride: false,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admissions/scan ─────────────────────────────────────────────────
export const scanDriver = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const rawNumber = req.body.driverNumber;
    const source = req.body.source === 'manual' ? 'manual' : 'scan';
    const driverNumber = String(rawNumber).trim().toUpperCase();
    const date = todayKey();
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    // Look up driver
    const driver = await Driver.findOne({ driverNumber });

    if (!driver) {
      await createAuditLog('ADMISSION_DENIED_NOT_FOUND', {
        userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
        resource: 'Driver', details: { driverNumber }, ipAddress: ip, userAgent: ua,
      });
      return res.json({
        success: true,
        result: 'NOT_FOUND',
        driverNumber,
        message: 'Driver number not found in system',
        requiresOverride: true,
      });
    }

    if (driver.status !== 'active') {
      await createAuditLog('ADMISSION_DENIED_INACTIVE', {
        userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
        resource: 'Driver', resourceId: driver._id.toString(),
        details: { driverNumber, driverName: driver.name }, ipAddress: ip, userAgent: ua,
      });
      return res.json({
        success: true,
        result: 'INACTIVE',
        driverNumber,
        driverName: driver.name,
        regionalServiceProvider: driver.regionalServiceProvider,
        message: 'Driver account is inactive',
        requiresOverride: true,
      });
    }

    // Count admissions today for re-entry sequence
    const todayCount = await Admission.countDocuments({ driverNumber, date });
    const entrySequence = todayCount + 1;
    const isReEntry = todayCount > 0;

    // Create admission record
    const admission = await Admission.create({
      driverNumber,
      driver: driver._id,
      driverName: driver.name,
      regionalServiceProvider: driver.regionalServiceProvider,
      driverStatus: 'active',
      admittedAt: new Date(),
      admittedBy: req.user._id,
      admittedByName: req.user.name,
      date,
      method: source,
      entrySequence,
    });

    await createAuditLog(isReEntry ? 'ADMISSION_REENTRY' : 'ADMISSION_GRANTED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'Admission', resourceId: admission._id.toString(),
      details: { driverNumber, driverName: driver.name, entrySequence }, ipAddress: ip, userAgent: ua,
    });

    return res.json({
      success: true,
      result: isReEntry ? 'RE_ENTRY' : 'ADMITTED',
      driverNumber,
      driverName: driver.name,
      regionalServiceProvider: driver.regionalServiceProvider,
      admittedAt: admission.admittedAt,
      entrySequence,
      message: isReEntry
        ? `Re-entry #${entrySequence} — welcome back, ${driver.name}`
        : `Admitted — welcome, ${driver.name}`,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admissions/override ─────────────────────────────────────────────
export const supervisorOverride = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { driverNumber: rawNumber, supervisorEmail, supervisorPassword, totpCode, overrideReason } = req.body;
    const driverNumber = String(rawNumber).trim().toUpperCase();
    const date = todayKey();
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    // Authenticate supervisor
    const supervisor = await User.findOne({ email: supervisorEmail.toLowerCase() })
      .select('+password +mfaSecret');

    if (!supervisor || !supervisor.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid supervisor credentials' });
    }
    if (!['supervisor', 'admin'].includes(supervisor.role)) {
      return res.status(403).json({ success: false, message: 'Supervisor or Admin role required for override' });
    }

    const passwordMatch = await supervisor.comparePassword(supervisorPassword);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid supervisor credentials' });
    }
    if (!verifyTotp(totpCode, supervisor.mfaSecret)) {
      return res.status(401).json({ success: false, message: 'Invalid authenticator code' });
    }

    // Look up driver (may not exist)
    const driver = await Driver.findOne({ driverNumber });
    const todayCount = await Admission.countDocuments({ driverNumber, date });
    const entrySequence = todayCount + 1;

    const admission = await Admission.create({
      driverNumber,
      driver: driver?._id || null,
      driverName: driver?.name || 'Unknown',
      regionalServiceProvider: driver?.regionalServiceProvider || '',
      driverStatus: driver ? driver.status : 'not_found',
      admittedAt: new Date(),
      admittedBy: req.user._id,
      admittedByName: req.user.name,
      date,
      method: 'supervisor_override',
      overrideReason,
      supervisorId: supervisor._id,
      supervisorName: supervisor.name,
      entrySequence,
    });

    await createAuditLog('ADMISSION_OVERRIDE', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'Admission', resourceId: admission._id.toString(),
      details: {
        driverNumber,
        driverName: driver?.name || 'Unknown',
        overrideReason,
        supervisorId: supervisor._id.toString(),
        supervisorEmail: supervisor.email,
      },
      ipAddress: ip, userAgent: ua,
    });

    return res.json({
      success: true,
      result: 'OVERRIDE_ADMITTED',
      driverNumber,
      driverName: driver?.name || 'Unknown',
      regionalServiceProvider: driver?.regionalServiceProvider || '',
      admittedAt: admission.admittedAt,
      supervisorName: supervisor.name,
      message: `Override approved by ${supervisor.name}`,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admissions ───────────────────────────────────────────────────────
export const getAdmissions = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, date, driverNumber, method } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (date) filter.date = date;
    if (driverNumber) filter.driverNumber = String(driverNumber).toUpperCase();
    if (method) filter.method = method;

    const [admissions, total] = await Promise.all([
      Admission.find(filter)
        .sort({ admittedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('admittedBy', 'name email')
        .populate('supervisorId', 'name email')
        .lean(),
      Admission.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      admissions,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admissions/stats ─────────────────────────────────────────────────
export const getAdmissionStats = async (req, res, next) => {
  try {
    const today = todayKey();

    const [todayTotal, todayReEntries, todayOverrides, hourlyRaw] = await Promise.all([
      Admission.countDocuments({ date: today }),
      Admission.countDocuments({ date: today, entrySequence: { $gt: 1 } }),
      Admission.countDocuments({ date: today, method: 'supervisor_override' }),
      Admission.aggregate([
        { $match: { date: today } },
        {
          $group: {
            _id: { $hour: '$admittedAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Build 24-hour array
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      count: hourlyRaw.find((r) => r._id === h)?.count || 0,
    }));

    // Recent 10 admissions
    const recent = await Admission.find({ date: today })
      .sort({ admittedAt: -1 })
      .limit(10)
      .populate('admittedBy', 'name')
      .lean();

    return res.json({
      success: true,
      stats: {
        today: { total: todayTotal, reEntries: todayReEntries, overrides: todayOverrides },
        hourly,
        recent,
      },
    });
  } catch (err) {
    next(err);
  }
};
