# LMS Production Deployment Guide

This guide provides concise, step-by-step instructions for deploying the **Enterprise Multi-Tenant School LMS & Management Portal** to **Vercel** (recommended serverless architecture) and **other hosting platforms** (Railway, Render, Docker/VPS).

---

## 1. System Architecture Overview

- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS Single Page Application (SPA).
- **Backend API:** Node.js 22 + Express + TypeScript + Prisma ORM.
- **Database:** PostgreSQL 16 (with connection pooling via PgBouncer for serverless).
- **Cache & Sessions:** Redis 7 (token blacklisting, session verification, analytics caching).
- **File Storage:** Vercel Blob (genuine store-level separation: private store for sensitive documents, public store for avatars/logos) or S3/Local.

---

## 2. Deploying on Vercel (Recommended)

Vercel provides unified fullstack hosting with automatic CDN distribution for the frontend and serverless execution for the Express API.

### Step 1: Connect Your Repository
1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New Project** -> **Import Git Repository**.
3. Select `https://github.com/abdullah-v-cmd/LMS-COMPLETE` (Branch: `main`).

### Step 2: Configure Build & Output Settings
Vercel automatically detects the configuration from `vercel.json` and root `package.json`:
- **Framework Preset:** `Vite`
- **Root Directory:** `./`
- **Build Command:** `npm run build`
- **Output Directory:** `client/dist`
- **Install Command:** `npm ci`

### Step 3: Configure Environment Variables
In **Project Settings** -> **Environment Variables**, configure the following for the `Production` environment:

```env
# Runtime
NODE_ENV="production"
PORT="4000"
API_PREFIX="/api/v1"
CLIENT_URL="https://your-lms-domain.vercel.app"

# Database (e.g. Neon, Supabase, or AWS RDS with PgBouncer)
DATABASE_URL="postgres://user:password@pooled-host:6543/dbname?sslmode=require&pgbouncer=true"
DIRECT_URL="postgres://user:password@direct-host:5432/dbname?sslmode=require"

# Cryptographic & Security Keys (min 32 characters, uniquely generated)
JWT_ACCESS_SECRET="<generate-64-character-random-hex-string>"
JWT_REFRESH_SECRET="<generate-distinct-64-character-random-hex-string>"
REPORT_CARD_SIGNING_SECRET="<generate-64-character-random-hex-string>"
COUNSELING_ENCRYPTION_SECRET="<generate-32-character-random-string>"
FINANCE_ENCRYPTION_SECRET="<generate-32-character-random-string>"

# Vercel Blob Storage Tokens (from Vercel Storage tab)
STORAGE_PROVIDER="VERCEL_BLOB"
BLOB_PRIVATE_READ_WRITE_TOKEN="vercel_blob_rw_..."
BLOB_PUBLIC_READ_WRITE_TOKEN="vercel_blob_rw_..."
# Backward-compatible fallback pointing to private store:
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."

# Redis Cache (e.g. Upstash Redis)
REDIS_URL="rediss://default:password@host:port"
REDIS_ENABLED="true"
```

> [!TIP]
> You can generate secure secrets quickly in your terminal:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### Step 4: Provision Vercel Blob Stores
1. In your Vercel Dashboard, navigate to the **Storage** tab.
2. Click **Create Database** -> select **Blob**.
3. Create a **Private Blob Store** named `lms-private-store` (for student submissions, exams, counseling records). Copy its read/write token to `BLOB_PRIVATE_READ_WRITE_TOKEN`.
4. (Optional) Create a **Public Blob Store** named `lms-public-store` (for school logos and user avatars). Copy its token to `BLOB_PUBLIC_READ_WRITE_TOKEN`.

### Step 5: Run Database Migrations
Before directing traffic to the deployment, apply the 24 database schema migrations:
```bash
# From your local terminal or release CI job:
DATABASE_URL="your-direct-connection-string" npm --prefix server run db:deploy

# (Optional) Seed initial demo institutions, academic years, and users:
DATABASE_URL="your-direct-connection-string" npm --prefix server run db:seed
```

### Step 6: Verify Deployment
1. Access `https://your-lms-domain.vercel.app/api/v1/health` -> verify HTTP 200 `{ status: "OK" }`.
2. Access `https://your-lms-domain.vercel.app/api/v1/health/ready` -> verify HTTP 200 `{ status: "READY", database: "reachable", redis: "connected" }`.
3. Log in to the frontend with administrative credentials:
   - Super Admin: `superadmin@alpha.edu` / `Password123!`
   - Institution Principal: `principal@alpha.edu` / `Password123!`

---

## 3. Deploying on Railway or Render (PaaS)

Railway and Render support continuous deployments from GitHub with attached managed PostgreSQL and Redis plugins.

### Option A: Railway
1. **Create a New Project:** Connect your GitHub repository.
2. **Add Services:**
   - Click **+ New** -> **Database** -> **Add PostgreSQL**.
   - Click **+ New** -> **Database** -> **Add Redis**.
3. **Configure Web Service:**
   - Railway will build using the root `Dockerfile`.
   - Set environment variables referencing the attached databases:
     - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
     - `REDIS_URL` = `${{Redis.REDIS_URL}}`
     - Add `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `REPORT_CARD_SIGNING_SECRET`, `COUNSELING_ENCRYPTION_SECRET`, `FINANCE_ENCRYPTION_SECRET`.
4. **Deploy Command:**
   - Build Command: `npm run build`
   - Start Command: `npx prisma migrate deploy --schema=server/prisma/schema.prisma && node server/dist/server.js`

### Option B: Render
1. Create a **Web Service** pointing to the repository.
2. Select **Docker** environment (uses root `Dockerfile`).
3. Create a **Render PostgreSQL** database and **Render Redis** instance.
4. Set the environment variables in the Render Dashboard.
5. In **Pre-Deploy Command**, enter:
   ```bash
   npx prisma migrate deploy --schema=server/prisma/schema.prisma
   ```

---

## 4. Deploying on Self-Hosted VPS / AWS EC2 / DigitalOcean (Docker Compose)

For high-control on-premises or cloud VM hosting:

### Step 1: Clone and Set Up Environment
```bash
git clone https://github.com/abdullah-v-cmd/LMS-COMPLETE.git /opt/lms
cd /opt/lms

# Copy environment template and populate production secrets
cp .env.example .env
nano .env
```

### Step 2: Start Supporting Services (PostgreSQL & Redis)
```bash
docker compose up -d postgres redis
```

### Step 3: Run Database Migrations & Seeds
```bash
npm --prefix server run db:deploy
npm --prefix server run db:seed
```

### Step 4: Build and Launch Full-Stack Container
```bash
docker build -t lms-app:latest .
docker run -d \
  --name lms-production \
  --restart always \
  --network host \
  --env-file .env \
  -v /opt/lms/uploads:/app/uploads \
  lms-app:latest
```

### Step 5: Configure Nginx Reverse Proxy with TLS
Install Certbot and configure Nginx (`/etc/nginx/sites-available/lms.conf`):

```nginx
server {
    server_name lms.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
```

Obtain free SSL certificate:
```bash
sudo certbot --nginx -d lms.yourdomain.com
```

---

## 5. Operations, Backups & Maintenance

### Database Backup
Run daily scheduled database snapshots:
```bash
pg_dump -Fc --no-owner --no-acl -d "$DATABASE_URL" > /opt/backups/lms_$(date +%Y%m%d_%H%M%S).dump
```

### Database Restore Drill
```bash
pg_restore --clean --if-exists --no-owner --no-acl -d "$TARGET_DATABASE_URL" /opt/backups/lms_backup.dump
```

### Storage Migration for Legacy Public Blobs
If updating an existing deployment that stored files prior to private store separation:
```bash
# Dry run (inspect without modification)
npx ts-node server/scripts/migrate_blob_storage.ts --dry-run

# Live migration to private store
npx ts-node server/scripts/migrate_blob_storage.ts
```

---

## 6. Verification Checklist

- [x] Backend TypeScript compilation: `0 errors` (`npm --prefix server run build`)
- [x] Frontend TypeScript & Vite bundle: `0 errors` (`npm --prefix client run build`)
- [x] Database migrations up to date: `24 of 24 applied` (`npx prisma migrate status`)
- [x] Full automated test suite passing: `352 / 352 passed across 46 test suites`
- [x] Playwright browser verification: `20 of 20 modules verified in Chromium`
- [x] GitHub Actions CI: configured with automated PostgreSQL and Redis service containers
- [x] Store-level isolation: private Vercel Blob store for sensitive assets, authenticated gateway access
