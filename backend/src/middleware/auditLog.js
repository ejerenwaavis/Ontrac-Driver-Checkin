import AuditLog from '../models/AuditLog.js';

/**
 * createAuditLog(action, options)
 * Silently logs — never throws (audit failure must not break the request).
 */
export const createAuditLog = async (action, options = {}) => {
  try {
    await AuditLog.create({
      userId: options.userId || null,
      userEmail: options.userEmail || null,
      userRole: options.userRole || null,
      action,
      resource: options.resource || null,
      resourceId: options.resourceId ? String(options.resourceId) : null,
      details: options.details || null,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write log:', err.message);
  }
};

/**
 * Extract client IP from request (handles proxies).
 */
export const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
};

/**
 * Sanitize user agent to prevent log injection.
 */
export const getUserAgent = (req) => {
  const ua = req.headers['user-agent'] || 'unknown';
  return ua.substring(0, 200);
};
