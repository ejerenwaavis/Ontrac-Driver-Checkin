import mongoose from 'mongoose';

const admissionSchema = new mongoose.Schema(
  {
    driverNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    // Snapshot fields (captured at admission time — not changed if driver record changes)
    driverName: { type: String, default: 'Unknown' },
    regionalServiceProvider: { type: String, default: '' },
    driverStatus: {
      type: String,
      enum: ['active', 'inactive', 'not_found'],
      default: 'active',
    },

    admittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    admittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    admittedByName: { type: String },

    // Date key for same-day window queries (YYYY-MM-DD in UTC)
    date: {
      type: String,
      required: true,
      index: true,
    },

    method: {
      type: String,
      enum: ['scan', 'manual', 'supervisor_override'],
      default: 'scan',
    },

    // Supervisor override fields
    overrideReason: { type: String, maxlength: 500 },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    supervisorName: { type: String },

    // Entry sequence for re-entries (1 = first entry, 2+ = re-entry)
    entrySequence: { type: Number, default: 1 },

    // Checkout lifecycle fields
    checkedOutAt: {
      type: Date,
      default: null,
      index: true,
    },
    checkedOutBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    checkedOutByName: { type: String },
    checkoutMethod: {
      type: String,
      enum: ['scan', 'manual'],
    },
    // Minutes on-site between check-in and checkout
    dwellMinutes: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient daily re-entry checks
admissionSchema.index({ driverNumber: 1, date: 1 });
admissionSchema.index({ driverNumber: 1, checkedOutAt: 1, admittedAt: -1 });
admissionSchema.index({ date: 1, checkedOutAt: 1 });

const Admission = mongoose.model('Admission', admissionSchema);
export default Admission;
