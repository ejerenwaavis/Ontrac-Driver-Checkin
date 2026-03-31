import rateLimit from 'express-rate-limit';

const makeHandler = (maxRequests, windowMinutes, message, keyGenerator) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    skipSuccessfulRequests: false,
    ...(keyGenerator && { keyGenerator }),
  });

// Key by authenticated user ID, fall back to IP for unauthenticated requests.
const userKey = (req) => req.user?._id?.toString() || req.ip;

// Key by email + IP so one user's failures don't lock out others on the same network.
const emailIpKey = (req) => `${(req.body?.email || '').toLowerCase()}|${req.ip}`;

// General API — 400 requests per 15 minutes per user (or per IP if not logged in)
export const generalLimiter = makeHandler(400, 15, 'Too many requests, please try again later.', userKey);

// Auth endpoints — 10 attempts per 15 minutes per email+IP
export const authLimiter = makeHandler(10, 15, 'Too many login attempts. Please wait 15 minutes.', emailIpKey);

// MFA verification — 10 attempts per 15 minutes per IP (no user context yet)
export const mfaLimiter = makeHandler(10, 15, 'Too many MFA attempts. Please wait 15 minutes.');

// Supervisor override — 3 attempts per 10 minutes per user
export const overrideLimiter = makeHandler(3, 10, 'Too many override attempts. Please wait 10 minutes.', userKey);

// Driver upload — 10 uploads per hour per user
export const uploadLimiter = makeHandler(10, 60, 'Too many upload requests. Please wait before uploading again.', userKey);
