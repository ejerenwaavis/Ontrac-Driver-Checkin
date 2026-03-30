import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema(
  {
    driverNumber: {
      type: String,
      required: [true, 'Driver number is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Driver name is required'],
      trim: true,
      maxlength: [150, 'Name cannot exceed 150 characters'],
    },
    regionalServiceProvider: {
      type: String,
      trim: true,
      maxlength: [200, 'RSP name cannot exceed 200 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    // Upload tracking
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    uploadBatch: {
      type: String, // ISO date string representing upload batch
    },
    // Reconciliation tracking
    lastSeenBatchDate: {
      type: String, // ISO date of the most recent roster upload that included this driver
      index: true,
    },
    deactivatedReason: {
      type: String,
      enum: ['manual', 'missing_from_upload', null],
      default: null,
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
  }
);

driverSchema.index({ name: 'text', regionalServiceProvider: 'text' });

const Driver = mongoose.model('Driver', driverSchema);
export default Driver;
