import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    userEmail: { type: String },
    userRole: { type: String },
    action: {
      type: String,
      required: true,
      enum: [
        // Auth
        'LOGIN_SUCCESS',
        'LOGIN_FAILED',
        'LOGOUT',
        'MFA_SETUP',
        'MFA_VERIFIED',
        'TOKEN_REFRESHED',
        // Driver admissions
        'ADMISSION_GRANTED',
        'ADMISSION_REENTRY',
        'ADMISSION_DENIED_INACTIVE',
        'ADMISSION_DENIED_NOT_FOUND',
        'ADMISSION_OVERRIDE',
        // Driver data
        'DRIVER_CREATED',
        'DRIVER_UPDATED',
        'DRIVER_DEACTIVATED',
        'DRIVERS_UPLOADED',
        // User management
        'USER_CREATED',
        'USER_UPDATED',
        'USER_DEACTIVATED',
        'USER_DELETED',
        'PASSWORD_CHANGED',
        'PASSWORD_RESET_BY_ADMIN',
        'USER_MFA_RESET',
        // Driver photos & invites
        'DRIVER_PHOTO_UPLOADED',
        'INVITE_CREATED',
        'INVITE_REVOKED',
        'DRIVER_HARD_DELETED',
      ],
      index: true,
    },
    resource: { type: String },
    resourceId: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true,
  }
);

// SOC 2: retain logs for 1 year, then auto-expire
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });
auditLogSchema.index({ userId: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
