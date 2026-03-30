import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [12, 'Password must be at least 12 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'supervisor', 'clerk'],
      default: 'clerk',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // MFA
    mfaSecret: {
      type: String,
      select: false,
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    // Refresh token management (hashed for security)
    refreshTokenHash: {
      type: String,
      select: false,
    },
    // Audit
    lastLogin: Date,
    lastLoginIp: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    forcePasswordChange: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never include password in JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.mfaSecret;
  delete obj.refreshTokenHash;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;
