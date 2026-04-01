import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import { runProductionChecks } from './utils/productionChecks.js';

import authRoutes from './routes/auth.js';
import driverRoutes from './routes/drivers.js';
import admissionRoutes from './routes/admissions.js';
import userRoutes from './routes/users.js';
import inviteRoutes from './routes/invite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Trust Proxy (behind LiteSpeed / Passenger) ─────────────────────────────
app.set('trust proxy', 1);

// ─── Database ────────────────────────────────────────────────────────────────
connectDB();

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      fontSrc:     ["'self'", 'https:', 'data:'],
      // Allow images from same origin, inline data URIs, and Cloudinary CDN
      imgSrc:      ["'self'", 'data:', 'https://res.cloudinary.com'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [FRONTEND_URL]
    : ['http://localhost:5173', 'http://localhost:4000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── General Middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invite', inviteRoutes);

// ─── Serve Frontend in Production ────────────────────────────────────────────
const distPath = path.join(__dirname, '../../frontend/dist');

runProductionChecks({
  nodeEnv: process.env.NODE_ENV,
  frontendDistPath: distPath,
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : err.message;

  if (status === 500) {
    console.error('[ERROR]', err);
  }

  res.status(status).json({ success: false, message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 OnTrac Driver Check-In API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend URL: ${FRONTEND_URL}\n`);
});

export default app;
