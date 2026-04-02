import dayjs from 'dayjs';
import { validationResult } from 'express-validator';
import Driver from '../models/Driver.js';
import Admission from '../models/Admission.js';
import User from '../models/User.js';
import { createAuditLog, getClientIp, getUserAgent } from '../middleware/auditLog.js';
import { verifyTotp } from '../utils/mfa.js';
import { getDriverPhotoUrl } from '../utils/ontracAdapter.js';

const todayKey = () => dayjs().format('YYYY-MM-DD');

const parseAnalyticsRange = (startDate, endDate) => {
  const end = endDate ? dayjs(endDate) : dayjs();
  const start = startDate ? dayjs(startDate) : end.subtract(13, 'day');

  if (!start.isValid() || !end.isValid() || start.isAfter(end)) {
    return null;
  }

  const days = end.startOf('day').diff(start.startOf('day'), 'day') + 1;
  if (days > 90) {
    return null;
  }

  return {
    start,
    end,
    days,
    startKey: start.format('YYYY-MM-DD'),
    endKey: end.format('YYYY-MM-DD'),
  };
};

const buildHourlySeries = (rows = []) => {
  const map = new Map(rows.map((r) => [Number(r._id), Number(r.count)]));
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    count: map.get(hour) || 0,
  }));
};

const roundOne = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return Number(value.toFixed(1));
};

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
        userId: req.user._id,
        userEmail: req.user.email,
        userRole: req.user.role,
        resource: 'Driver',
        details: { driverNumber },
        ipAddress: ip,
        userAgent: ua,
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
        userId: req.user._id,
        userEmail: req.user.email,
        userRole: req.user.role,
        resource: 'Driver',
        resourceId: driver._id.toString(),
        details: { driverNumber, driverName: driver.name },
        ipAddress: ip,
        userAgent: ua,
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

    // Prevent duplicate open cycles for the same day.
    const openAdmission = await Admission.findOne({ driverNumber, date, checkedOutAt: null })
      .sort({ admittedAt: -1 })
      .lean();

    if (openAdmission) {
      return res.json({
        success: true,
        result: 'ALREADY_ADMITTED',
        driverNumber,
        driverName: openAdmission.driverName || driver.name,
        regionalServiceProvider: openAdmission.regionalServiceProvider || driver.regionalServiceProvider,
        admittedAt: openAdmission.admittedAt,
        entrySequence: openAdmission.entrySequence,
        requiresCheckout: true,
        message: 'Driver is already checked in. Please complete checkout at exit before a new check-in.',
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
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      resource: 'Admission',
      resourceId: admission._id.toString(),
      details: { driverNumber, driverName: driver.name, entrySequence },
      ipAddress: ip,
      userAgent: ua,
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

// ── POST /api/admissions/checkout ─────────────────────────────────────────────
export const checkoutDriver = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const rawNumber = req.body.driverNumber;
    const source = req.body.source === 'manual' ? 'manual' : 'scan';
    const driverNumber = String(rawNumber).trim().toUpperCase();
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    const openAdmission = await Admission.findOne({ driverNumber, checkedOutAt: null })
      .sort({ admittedAt: -1 });

    if (!openAdmission) {
      return res.json({
        success: true,
        result: 'NOT_CHECKED_IN',
        driverNumber,
        message: 'No open check-in found for this driver. The cycle is already complete.',
      });
    }

    const checkedOutAt = new Date();
    const dwellMinutes = Number(
      Math.max(0, (checkedOutAt.getTime() - new Date(openAdmission.admittedAt).getTime()) / 60000).toFixed(1)
    );

    openAdmission.checkedOutAt = checkedOutAt;
    openAdmission.checkedOutBy = req.user._id;
    openAdmission.checkedOutByName = req.user.name;
    openAdmission.checkoutMethod = source;
    openAdmission.dwellMinutes = dwellMinutes;
    await openAdmission.save();

    await createAuditLog('ADMISSION_CHECKOUT', {
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      resource: 'Admission',
      resourceId: openAdmission._id.toString(),
      details: {
        driverNumber,
        driverName: openAdmission.driverName,
        entrySequence: openAdmission.entrySequence,
        dwellMinutes,
      },
      ipAddress: ip,
      userAgent: ua,
    });

    return res.json({
      success: true,
      result: 'CHECKED_OUT',
      driverNumber,
      driverName: openAdmission.driverName,
      regionalServiceProvider: openAdmission.regionalServiceProvider,
      admittedAt: openAdmission.admittedAt,
      checkedOutAt,
      entrySequence: openAdmission.entrySequence,
      dwellMinutes,
      message: `Checked out ${openAdmission.driverName || driverNumber}. Cycle completed successfully.`,
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

    const {
      driverNumber: rawNumber,
      supervisorEmail,
      supervisorPassword,
      totpCode,
      overrideReason,
    } = req.body;
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

    const openAdmission = await Admission.findOne({ driverNumber, date, checkedOutAt: null })
      .sort({ admittedAt: -1 })
      .lean();

    if (openAdmission) {
      return res.json({
        success: true,
        result: 'ALREADY_ADMITTED',
        driverNumber,
        driverName: openAdmission.driverName || driver?.name || 'Unknown',
        regionalServiceProvider: openAdmission.regionalServiceProvider || driver?.regionalServiceProvider || '',
        admittedAt: openAdmission.admittedAt,
        entrySequence: openAdmission.entrySequence,
        requiresCheckout: true,
        message: 'Driver is already checked in. Please complete checkout at exit before a new check-in.',
      });
    }

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
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      resource: 'Admission',
      resourceId: admission._id.toString(),
      details: {
        driverNumber,
        driverName: driver?.name || 'Unknown',
        overrideReason,
        supervisorId: supervisor._id.toString(),
        supervisorEmail: supervisor.email,
      },
      ipAddress: ip,
      userAgent: ua,
    });

    return res.json({
      success: true,
      result: 'OVERRIDE_ADMITTED',
      driverNumber,
      driverName: driver?.name || 'Unknown',
      regionalServiceProvider: driver?.regionalServiceProvider || '',
      admittedAt: admission.admittedAt,
      supervisorName: supervisor.name,
      entrySequence,
      message: `Override approved by ${supervisor.name}`,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admissions ───────────────────────────────────────────────────────
export const getAdmissions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      date,
      driverNumber,
      method,
      status,
    } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (date) filter.date = date;
    if (driverNumber) filter.driverNumber = String(driverNumber).toUpperCase();
    if (method) filter.method = method;
    if (status === 'open') filter.checkedOutAt = null;
    if (status === 'closed') filter.checkedOutAt = { $ne: null };

    const [admissions, total] = await Promise.all([
      Admission.find(filter)
        .sort({ admittedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('admittedBy', 'name email')
        .populate('checkedOutBy', 'name email')
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

    const [
      todayTotal,
      todayReEntries,
      todayOverrides,
      todayCheckouts,
      todayOpenCycles,
      avgDwellRaw,
      hourlyRaw,
      hourlyCheckoutRaw,
    ] = await Promise.all([
      Admission.countDocuments({ date: today }),
      Admission.countDocuments({ date: today, entrySequence: { $gt: 1 } }),
      Admission.countDocuments({ date: today, method: 'supervisor_override' }),
      Admission.countDocuments({ date: today, checkedOutAt: { $ne: null } }),
      Admission.countDocuments({ date: today, checkedOutAt: null }),
      Admission.aggregate([
        {
          $match: {
            date: today,
            checkedOutAt: { $ne: null },
            dwellMinutes: { $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgDwellMinutes: { $avg: '$dwellMinutes' },
          },
        },
      ]),
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
      Admission.aggregate([
        { $match: { date: today, checkedOutAt: { $ne: null } } },
        {
          $group: {
            _id: { $hour: '$checkedOutAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Recent 10 admissions
    const recent = await Admission.find({ date: today })
      .sort({ admittedAt: -1 })
      .limit(10)
      .populate('admittedBy', 'name')
      .populate('checkedOutBy', 'name')
      .lean();

    return res.json({
      success: true,
      stats: {
        today: {
          total: todayTotal,
          reEntries: todayReEntries,
          overrides: todayOverrides,
          checkouts: todayCheckouts,
          openCycles: todayOpenCycles,
          avgDwellMinutes: roundOne(avgDwellRaw[0]?.avgDwellMinutes ?? null),
        },
        hourly: buildHourlySeries(hourlyRaw),
        hourlyCheckout: buildHourlySeries(hourlyCheckoutRaw),
        recent,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admissions/analytics ─────────────────────────────────────────────
export const getAdmissionAnalytics = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const range = parseAnalyticsRange(req.query.startDate, req.query.endDate);
    if (!range) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range. Use YYYY-MM-DD format and a maximum window of 90 days.',
      });
    }

    const rangeMatch = {
      date: { $gte: range.startKey, $lte: range.endKey },
    };

    const [
      checkIns,
      completedCycles,
      openCycles,
      overrides,
      reEntries,
      avgDwellRaw,
      trendRaw,
      providerRaw,
      checkInHourRaw,
      checkOutHourRaw,
      checkInMethodRaw,
      checkOutMethodRaw,
    ] = await Promise.all([
      Admission.countDocuments(rangeMatch),
      Admission.countDocuments({ ...rangeMatch, checkedOutAt: { $ne: null } }),
      Admission.countDocuments({ ...rangeMatch, checkedOutAt: null }),
      Admission.countDocuments({ ...rangeMatch, method: 'supervisor_override' }),
      Admission.countDocuments({ ...rangeMatch, entrySequence: { $gt: 1 } }),
      Admission.aggregate([
        {
          $match: {
            ...rangeMatch,
            checkedOutAt: { $ne: null },
            dwellMinutes: { $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgDwellMinutes: { $avg: '$dwellMinutes' },
          },
        },
      ]),
      Admission.aggregate([
        { $match: rangeMatch },
        {
          $group: {
            _id: '$date',
            checkIns: { $sum: 1 },
            checkOuts: {
              $sum: {
                $cond: [{ $ne: ['$checkedOutAt', null] }, 1, 0],
              },
            },
            overrides: {
              $sum: {
                $cond: [{ $eq: ['$method', 'supervisor_override'] }, 1, 0],
              },
            },
            reEntries: {
              $sum: {
                $cond: [{ $gt: ['$entrySequence', 1] }, 1, 0],
              },
            },
            dwellTotal: { $sum: { $ifNull: ['$dwellMinutes', 0] } },
            dwellSamples: {
              $sum: {
                $cond: [{ $ne: ['$dwellMinutes', null] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            date: '$_id',
            checkIns: 1,
            checkOuts: 1,
            overrides: 1,
            reEntries: 1,
            avgDwellMinutes: {
              $cond: [
                { $gt: ['$dwellSamples', 0] },
                { $divide: ['$dwellTotal', '$dwellSamples'] },
                null,
              ],
            },
          },
        },
        { $sort: { date: 1 } },
      ]),
      Admission.aggregate([
        { $match: rangeMatch },
        {
          $project: {
            provider: {
              $let: {
                vars: {
                  rsp: { $ifNull: ['$regionalServiceProvider', ''] },
                },
                in: {
                  $cond: [{ $eq: ['$$rsp', ''] }, 'Unspecified', '$$rsp'],
                },
              },
            },
            checkedOutAt: 1,
            method: 1,
            dwellMinutes: 1,
          },
        },
        {
          $group: {
            _id: '$provider',
            checkIns: { $sum: 1 },
            completedCycles: {
              $sum: {
                $cond: [{ $ne: ['$checkedOutAt', null] }, 1, 0],
              },
            },
            overrides: {
              $sum: {
                $cond: [{ $eq: ['$method', 'supervisor_override'] }, 1, 0],
              },
            },
            dwellTotal: { $sum: { $ifNull: ['$dwellMinutes', 0] } },
            dwellSamples: {
              $sum: {
                $cond: [{ $ne: ['$dwellMinutes', null] }, 1, 0],
              },
            },
          },
        },
        { $sort: { checkIns: -1 } },
        { $limit: 12 },
      ]),
      Admission.aggregate([
        { $match: rangeMatch },
        {
          $group: {
            _id: { $hour: '$admittedAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Admission.aggregate([
        { $match: { ...rangeMatch, checkedOutAt: { $ne: null } } },
        {
          $group: {
            _id: { $hour: '$checkedOutAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Admission.aggregate([
        { $match: rangeMatch },
        {
          $group: {
            _id: '$method',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Admission.aggregate([
        { $match: { ...rangeMatch, checkoutMethod: { $in: ['scan', 'manual'] } } },
        {
          $group: {
            _id: '$checkoutMethod',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
    ]);

    const trendMap = new Map(trendRaw.map((row) => [row.date, row]));
    const trends = Array.from({ length: range.days }, (_, idx) => {
      const date = range.start.add(idx, 'day').format('YYYY-MM-DD');
      const row = trendMap.get(date);
      return {
        date,
        checkIns: row?.checkIns || 0,
        checkOuts: row?.checkOuts || 0,
        overrides: row?.overrides || 0,
        reEntries: row?.reEntries || 0,
        avgDwellMinutes: roundOne(row?.avgDwellMinutes),
      };
    });

    const providerBreakdown = providerRaw.map((row) => {
      const completionRate = row.checkIns > 0
        ? Number(((row.completedCycles / row.checkIns) * 100).toFixed(1))
        : 0;
      const avgDwellMinutes = row.dwellSamples > 0
        ? Number((row.dwellTotal / row.dwellSamples).toFixed(1))
        : null;

      return {
        provider: row._id,
        checkIns: row.checkIns,
        completedCycles: row.completedCycles,
        completionRate,
        overrides: row.overrides,
        avgDwellMinutes,
      };
    });

    return res.json({
      success: true,
      analytics: {
        range: {
          startDate: range.startKey,
          endDate: range.endKey,
          days: range.days,
        },
        summary: {
          checkIns,
          completedCycles,
          openCycles,
          overrides,
          reEntries,
          completionRate: checkIns > 0
            ? Number(((completedCycles / checkIns) * 100).toFixed(1))
            : 0,
          avgDwellMinutes: roundOne(avgDwellRaw[0]?.avgDwellMinutes ?? null),
        },
        trends,
        providerBreakdown,
        hourly: {
          checkIns: buildHourlySeries(checkInHourRaw),
          checkOuts: buildHourlySeries(checkOutHourRaw),
        },
        methods: {
          checkIn: checkInMethodRaw.map((m) => ({ method: m._id, count: m.count })),
          checkOut: checkOutMethodRaw.map((m) => ({ method: m._id, count: m.count })),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};