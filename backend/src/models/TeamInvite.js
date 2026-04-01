import mongoose from 'mongoose';

const teamInviteSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /**
     * 'team'      — multi-use link; any driver on the team can use it
     * 'reregister' — single-use link locked to one specific driver number;
     *                issued by a supervisor to allow a photo update
     */
    type: {
      type: String,
      enum: ['team', 'reregister'],
      default: 'team',
      required: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Team name cannot exceed 100 characters'],
    },
    // Only set for 'reregister' invites — restricts usage to this driver number
    lockedDriverNumber: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdByName: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    timesUsed: {
      type: Number,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

teamInviteSchema.index({ expiresAt: 1 });

const TeamInvite = mongoose.model('TeamInvite', teamInviteSchema);
export default TeamInvite;
