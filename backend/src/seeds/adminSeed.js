/**
 * Admin seed script.
 * Run once: npm run seed
 *
 * Creates the first admin user from .env:
 *   ADMIN_EMAIL / ADMIN_PASSWORD
 *
 * Safe to re-run — skips if admin already exists.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

const seed = async () => {
  const MONGODBURI = process.env.MONGODBURI;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!MONGODBURI || !email || !password) {
    console.error('❌ MONGODBURI, ADMIN_EMAIL, and ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('❌ ADMIN_PASSWORD must be at least 12 characters');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODBURI);
    console.log('✅ Connected to MongoDB');

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      console.log(`ℹ️  Admin user already exists: ${email}`);
      console.log('   No changes made.');
      process.exit(0);
    }

    const admin = await User.create({
      name: 'System Administrator',
      email: email.toLowerCase(),
      password,
      role: 'admin',
      isActive: true,
      mfaEnabled: false, // Will be enforced on first login
    });

    console.log('\n✅ Admin user created successfully!');
    console.log(`   Email   : ${admin.email}`);
    console.log(`   Role    : ${admin.role}`);
    console.log(`   ID      : ${admin._id}`);
    console.log('\n⚠️  IMPORTANT: On first login, you will be prompted to set up');
    console.log('   Google Authenticator / Authy MFA. This is required before');
    console.log('   any access is granted.\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
