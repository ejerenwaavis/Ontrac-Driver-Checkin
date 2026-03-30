import mongoose from 'mongoose';

/**
 * DriverRosterSnapshot — one document per upload batch.
 * Expires after 60 days via TTL index for automated storage cleanup.
 */
const driverRosterSnapshotSchema = new mongoose.Schema(
  {
    uploadDate: { type: Date, required: true, default: Date.now },
    batchId:    { type: String, required: true, index: true },   // ISO date string YYYY-MM-DD
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    filename:   { type: String },
    mode:       { type: String, enum: ['additive', 'strict_replace'], default: 'additive' },
    stats: {
      total:       { type: Number, default: 0 },
      inserted:    { type: Number, default: 0 },
      updated:     { type: Number, default: 0 },
      autoInactivated: { type: Number, default: 0 },
      skipped:     { type: Number, default: 0 },
      errors:      { type: Number, default: 0 },
    },
    // Per-driver snapshot for historical investigation
    driverSnapshot: [
      {
        driverNumber: String,
        name:         String,
        rsp:          String,
        status:       { type: String, enum: ['active', 'inactive'] },
      },
    ],
    rowErrors: [
      {
        row:    Number,
        driverNumber: String,
        error:  String,
      },
    ],
  },
  { timestamps: true }
);

// ── TTL: destroy snapshots after 60 days ──────────────────────────────────────
driverRosterSnapshotSchema.index({ uploadDate: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

const DriverRosterSnapshot = mongoose.model('DriverRosterSnapshot', driverRosterSnapshotSchema);
export default DriverRosterSnapshot;
