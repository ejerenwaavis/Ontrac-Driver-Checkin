import rateLimit from 'express-rate-limit';

const makeHandler = (maxRequests, windowMinutes, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    skipSuccessfulRequests: false,
  });

// General API — 200 requests per 15 minutes
export const generalLimiter = makeHandler(200, 15, 'Too many requests, please try again later.');

// Auth endpoints — 5 attempts per 15 minutes
export const authLimiter = makeHandler(5, 15, 'Too many login attempts. Please wait 15 minutes.');

// MFA verification — 10 attempts per 15 minutes (slightly more lenient — typos happen)
export const mfaLimiter = makeHandler(10, 15, 'Too many MFA attempts. Please wait 15 minutes.');

// Supervisor override — 3 attempts per 10 minutes (strict)
export const overrideLimiter = makeHandler(3, 10, 'Too many override attempts. Please wait 10 minutes.');

// Driver upload — 10 uploads per hour
export const uploadLimiter = makeHandler(10, 60, 'Too many upload requests. Please wait before uploading again.');
