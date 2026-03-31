import fs from 'fs';
import path from 'path';

const REQUIRED_VARS = [
  'MONGODBURI',
  'FRONTEND_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
];

const looksWeakSecret = (value = '') => {
  const lower = String(value).toLowerCase();
  return (
    value.length < 32
    || lower.includes('should_be_changed')
    || lower.includes('my_super_secret')
    || lower.includes('my_super_refresh_secret')
  );
};

export const runProductionChecks = ({ nodeEnv, frontendDistPath }) => {
  if (nodeEnv !== 'production') return;

  const missingVars = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missingVars.length > 0) {
    console.warn(`[WARN] Missing production env vars: ${missingVars.join(', ')}`);
  }

  if (looksWeakSecret(process.env.JWT_SECRET)) {
    console.warn('[WARN] JWT_SECRET appears weak/default. Rotate before public demo.');
  }
  if (looksWeakSecret(process.env.JWT_REFRESH_SECRET)) {
    console.warn('[WARN] JWT_REFRESH_SECRET appears weak/default. Rotate before public demo.');
  }

  const indexPath = path.join(frontendDistPath, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.warn(`[WARN] Frontend build missing at ${indexPath}. Run frontend build on server.`);
  }
};
