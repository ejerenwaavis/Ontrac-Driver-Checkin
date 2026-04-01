import multer from 'multer';
import { validationResult } from 'express-validator';
import Driver from '../models/Driver.js';
import DriverRosterSnapshot from '../models/DriverRosterSnapshot.js';
import { processDriverUpload } from '../utils/xlsxUpload.js';
import { createAuditLog, getClientIp, getUserAgent } from '../middleware/auditLog.js';
import { deleteDriverPhoto } from '../utils/cloudinary.js';

// ── Multer (memory storage — no temp files on disk) ───────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    const extOk = /\.(xlsx|xls)$/i.test(file.originalname);
    if (allowed.includes(file.mimetype) || extOk) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx and .xls files are accepted'));
    }
  },
});

export const uploadMiddleware = upload.single('file');

// ── GET /api/drivers ──────────────────────────────────────────────────────────
export const getDrivers = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, status, rsp } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (status) filter.status = status;
    if (rsp) filter.regionalServiceProvider = { $regex: rsp, $options: 'i' };
    if (search) {
      filter.$or = [
        { driverNumber: { $regex: search.toUpperCase() } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const [drivers, total] = await Promise.all([
      Driver.find(filter).sort({ driverNumber: 1 }).skip(skip).limit(Number(limit)).lean(),
      Driver.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      drivers,
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

// ── GET /api/drivers/:id ──────────────────────────────────────────────────────
export const getDriver = async (req, res, next) => {
  try {
    const driver = await Driver.findById(req.params.id).lean();
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });
    return res.json({ success: true, driver });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/drivers/:id/status ─────────────────────────────────────────────
export const updateDriverStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or inactive' });
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    await createAuditLog(status === 'inactive' ? 'DRIVER_DEACTIVATED' : 'DRIVER_UPDATED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'Driver', resourceId: driver._id.toString(),
      details: { driverNumber: driver.driverNumber, status },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, driver });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/drivers/upload ──────────────────────────────────────────────────
export const uploadDrivers = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // strictReplace and confirmDrop come from a form field alongside the file
    const strictReplace = req.body.strictReplace === 'true' || req.body.strictReplace === true;
    const confirmDrop   = req.body.confirmDrop   === 'true' || req.body.confirmDrop   === true;

    const results = await processDriverUpload(
      req.file.buffer,
      req.user._id,
      { strictReplace, confirmDrop, filename: req.file.originalname }
    );

    // Safety gate — drop too large, front-end must confirm
    if (results.needsConfirmation) {
      return res.status(200).json({ success: true, needsConfirmation: true, ...results });
    }

    await createAuditLog('DRIVERS_UPLOADED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'Driver',
      details: {
        filename: req.file.originalname,
        mode: results.mode,
        total: results.total,
        inserted: results.inserted,
        updated: results.updated,
        autoInactivated: results.autoInactivated,
        skipped: results.skipped,
        errorCount: results.errors.length,
      },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, ...results });
  } catch (err) {
    if (err.message?.includes('Only .xlsx')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};

// ── GET /api/drivers/roster-snapshots ────────────────────────────────────────
export const getRosterSnapshots = async (req, res, next) => {
  try {
    const snapshots = await DriverRosterSnapshot
      .find()
      .sort({ uploadDate: -1 })
      .limit(30)
      .select('-driverSnapshot -rowErrors')
      .populate('uploadedBy', 'name email')
      .lean();
    return res.json({ success: true, snapshots });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/drivers/providers ────────────────────────────────────────────────
export const getProviders = async (req, res, next) => {
  try {
    const providers = await Driver.distinct('regionalServiceProvider');
    return res.json({ success: true, providers: providers.filter(Boolean).sort() });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/drivers/:id — hard delete (admin only) ───────────────────────
export const hardDeleteDriver = async (req, res, next) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    if (driver.status !== 'inactive') {
      return res.status(400).json({
        success: false,
        message: 'Driver must be deactivated before deletion.',
      });
    }

    // Remove Cloudinary photo (non-fatal)
    await deleteDriverPhoto(driver.driverNumber);

    const { driverNumber, name } = driver;
    await driver.deleteOne();

    await createAuditLog('DRIVER_HARD_DELETED', {
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role,
      resource: 'Driver', resourceId: req.params.id,
      details: { driverNumber, name },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return res.json({ success: true, message: `Driver ${driverNumber} deleted` });
  } catch (err) {
    next(err);
  }
};
