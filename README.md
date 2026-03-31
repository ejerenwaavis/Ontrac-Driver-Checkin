# OnTrac Driver Check-In

SOC 2-minded driver check-in system with barcode scanning, MFA, RBAC, audit logs, and PWA support.

## Deployment Model

This project is designed to run as one app server process in production:

1. Build the React frontend to `frontend/dist`
2. Start the Express backend
3. Express serves both API routes (`/api/*`) and static frontend assets

No separate frontend server is required in production.

## Local Development

```bash
npm run install:all
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`

## Production (Single Server)

```bash
npm run install:all
npm run build:prod
npm run start:prod
```

Then reverse proxy your domain to `127.0.0.1:4000` with Nginx.

## PM2 (Recommended)

Use the provided `ecosystem.config.cjs`:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## Environment

Set values in `backend/.env`:

- `PORT=4000`
- `NODE_ENV=production` (recommended)
- `FRONTEND_URL=https://drivercheckin.aceddivision.com`
- `MONGODBURI=...`
- `JWT_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- `ADMIN_EMAIL=...`
- `ADMIN_PASSWORD=...`

## Startup Safety Checks (Production)

On startup, the backend now prints warnings in production if:

- required env vars are missing
- JWT secrets look like default/weak placeholders
- `frontend/dist/index.html` is missing

These checks are non-blocking warnings to speed up cPanel/LiteSpeed troubleshooting.

## Seed Admin User

```bash
npm run seed
```

## Nginx

See `nginx.conf` for a starter reverse proxy configuration.
