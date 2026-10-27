# Enterprise Deployment & Operations Guide
## School & Learning Management System (LMS Platform v2.5.0)

---

## Table of Contents
1. [Architecture Overview & Production Topology](#1-architecture-overview--production-topology)
2. [Prerequisites & System Specifications](#2-prerequisites--system-specifications)
3. [Environment Configuration & Secrets Matrix](#3-environment-configuration--secrets-matrix)
4. [Bare-Metal / Linux VPS Deployment (Ubuntu 22.04 LTS / Debian 12)](#4-bare-metal--linux-vps-deployment)
5. [Docker & Containerized Deployment](#5-docker--containerized-deployment)
6. [Database Setup, Migration & Zero-Downtime Rollout](#6-database-setup-migration--zero-downtime-rollout)
7. [Nginx Reverse Proxy, SSL/TLS & Security Headers](#7-nginx-reverse-proxy-ssltls--security-headers)
8. [Database Backup, Restore & Disaster Recovery Runbook](#8-database-backup-restore--disaster-recovery-runbook)
9. [High Availability, Scaling & Performance Tuning](#9-high-availability-scaling--performance-tuning)
10. [Health Probes, Observability & Incident Response](#10-health-probes-observability--incident-response)

---

## 1. Architecture Overview & Production Topology

The application is structured as a modern multi-tenant enterprise system with a decoupled single-page application (SPA) client and a stateless Node.js / Express backend backed by PostgreSQL and Redis.

```
                                [ CLIENT TRAFFIC ]
                                        │
                                        ▼ (HTTPS / 443)
                      ┌───────────────────────────────────┐
                      │    Cloudflare / AWS CloudFront    │
                      │    (DDoS Mitigation & Edge CDN)   │
                      └─────────────────┬─────────────────┘
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
               ┌───────────────────┐         ┌───────────────────┐
               │  Static SPA Web   │         │ Nginx Reverse     │
               │  (Vite / React)   │         │ Proxy (Port 443)  │
               └───────────────────┘         └─────────┬─────────┘
                                                       │
                                  ┌────────────────────┴────────────────────┐
                                  ▼ (HTTP / Port 4000)                      ▼
                      ┌───────────────────────────┐           ┌───────────────────────────┐
                      │ Node.js Backend Cluster   │           │ Node.js Backend Cluster   │
                      │ Worker #1 (PM2 / Docker)  │           │ Worker #2 (PM2 / Docker)  │
                      └─────────────┬─────────────┘           └─────────────┬─────────────┘
                                    │                                       │
                    ┌───────────────┴───────────────────────────────────────┴───────────────┐
                    ▼                                                                       ▼
      ┌───────────────────────────┐                                           ┌───────────────────────────┐
      │     Managed PostgreSQL    │                                           │       Redis Cache         │
      │       (v15+ with SSL)     │                                           │      (v7.0+ In-Memory)    │
      │  - Row-Level Isolation    │                                           │  - Rate Limiting Tokens   │
      │  - Multi-Tenant Schema    │                                           │  - Analytics Dashboard    │
      │  - Read/Write Segregation │                                           │  - Revoked Token Blacklist│
      └───────────────────────────┘                                           └───────────────────────────┘
```

---

## 2. Prerequisites & System Specifications

### 2.1 Minimum Hardware Requirements
* **Development / Staging**:
  * 2 vCPU, 4 GB RAM, 25 GB NVMe SSD Storage.
* **Production (Up to 5,000 Concurrent Users / 50,000 Enrolled Students)**:
  * Application Tier: 4 vCPU, 8 GB RAM (clustered across 4 worker threads).
  * PostgreSQL Database Tier: 4 vCPU, 16 GB RAM, 100 GB NVMe SSD with automated snapshots.
  * Redis Tier: 2 vCPU, 4 GB RAM.

### 2.2 Software Prerequisites
* **Operating System**: Ubuntu 22.04 LTS (Jammy Jellyfish) or Debian 12 (Bookworm).
* **Node.js**: v20.x or v22.x LTS (`node -v` >= 20.10.0).
* **Package Manager**: npm v10.x or pnpm v9.x.
* **Database**: PostgreSQL v15 or v16 with `pgcrypto` and SSL enabled.
* **Cache / In-Memory Store**: Redis v7.0+.
* **Reverse Proxy**: Nginx 1.22+ or OpenResty.
* **Process Manager**: PM2 v5.3+ (`npm install -g pm2`).
* **SSL Certificate**: Let's Encrypt Certbot via ACME protocol.

---

## 3. Environment Configuration & Secrets Matrix

All production secrets must be generated using cryptographically secure pseudo-random generators (`openssl rand -hex 32`) and stored in a dedicated vault (AWS Secrets Manager, HashiCorp Vault, or Doppler). **Never commit production `.env` files to source repositories.**

### 3.1 Server Environment (`server/.env`)
| Variable Key | Type / Length | Description & Entropy Requirement |
| :--- | :--- | :--- |
| `NODE_ENV` | String | Must be set to `production`. Activates hardened error masking. |
| `PORT` | Integer | Internal HTTP port (Default: `4000`). |
| `API_PREFIX` | String | API routing prefix (Default: `/api/v1`). |
| `CLIENT_URL` | URL | Exact HTTPS frontend origin (e.g., `https://lms.yourinstitution.edu`). |
| `DATABASE_URL` | PostgreSQL URL | `postgresql://user:pass@host:5432/lms_prod?sslmode=require&connection_limit=30` |
| `REDIS_URL` | Redis URL | `rediss://default:strongpassword@redis-host:6379/0` (TLS required in prod). |
| `JWT_ACCESS_SECRET` | 64+ hex chars | Secret for signing short-lived access tokens (15-min expiry). |
| `JWT_REFRESH_SECRET` | 64+ hex chars | Secret for signing refresh tokens (7-day expiry with rotation). |
| `REPORT_CARD_SIGNING_SECRET` | 64+ hex chars | HMAC-SHA256 secret for tamper-proof report card verification. |
| `COUNSELING_ENCRYPTION_SECRET` | 64 hex chars | AES-256-GCM encryption key for student counseling records. |
| `UPLOAD_DIR` | File Path | Directory for student & teacher PDF worksheets (Default: `./uploads`). |
| `MAX_FILE_SIZE_MB` | Integer | Maximum upload payload size in megabytes (Default: `15`). |
| `RATE_LIMIT_MAX` | Integer | Maximum API requests per IP window (Default: `200` per minute). |
| `LOG_LEVEL` | String | Production logging level (`info` or `warn`). |

### 3.2 Client Environment (`client/.env.production`)
| Variable Key | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://api.lms.yourinstitution.edu/api/v1` | Public HTTPS backend URL. |

---

## 4. Bare-Metal / Linux VPS Deployment

### Step 1: System Provisioning & User Isolation
```bash
# Update system repositories
sudo apt update && sudo apt upgrade -y

# Create unprivileged system user for the LMS platform
sudo adduser --system --group --home /opt/lms lmsapp
sudo usermod -aG sudo lmsapp

# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git redis-server certbot python3-certbot-nginx
```

### Step 2: Code Deployment & Building
```bash
# Clone the repository to the production root
cd /opt/lms
sudo -u lmsapp git clone https://github.com/your-org/lms2.git .

# Install dependencies and build Server
cd /opt/lms/server
sudo -u lmsapp npm ci --production=false
sudo -u lmsapp npm run build

# Install dependencies and build Client SPA
cd /opt/lms/client
sudo -u lmsapp npm ci
sudo -u lmsapp npm run build
```

### Step 3: PM2 Process Management Clustering
Create `/opt/lms/ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'lms-api-production',
      cwd: '/opt/lms/server',
      script: 'dist/app.js',
      instances: 'max', // Scales across all CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
```
Start and configure PM2 startup persistence:
```bash
sudo -u lmsapp pm2 start /opt/lms/ecosystem.config.js
sudo pm2 startup systemd -u lmsapp --hp /opt/lms
sudo -u lmsapp pm2 save
```

---

## 5. Docker & Containerized Deployment

### 5.1 Multi-Stage Production Dockerfile (`server/Dockerfile`)
```dockerfile
# Stage 1: Build Stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2: Minimal Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S lmsgroup && adduser -S lmsuser -G lmsgroup
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
RUN npx prisma generate
USER lmsuser
EXPOSE 4000
CMD ["node", "dist/app.js"]
```

### 5.2 Production Compose (`docker-compose.prod.yml`)
```yaml
version: '3.8'

services:
  database:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_DB: lms_production
      POSTGRES_USER: lms_db_user
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - lms-internal

  cache:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - lms-internal

  api:
    build:
      context: ./server
      dockerfile: Dockerfile
    restart: always
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://lms_db_user:${DB_PASSWORD}@database:5432/lms_production?sslmode=disable
      REDIS_URL: redis://:${REDIS_PASSWORD}@cache:6379/0
    depends_on:
      - database
      - cache
    networks:
      - lms-internal
      - lms-public
    ports:
      - "4000:4000"

volumes:
  postgres_data:
  redis_data:

networks:
  lms-internal:
    internal: true
  lms-public:
```

---

## 6. Database Setup, Migration & Zero-Downtime Rollout

### Database Migration Protocol
1. **Never run `prisma migrate dev` in staging or production.**
2. Use the deployment migration command:
   ```bash
   cd /opt/lms/server
   npx prisma migrate deploy
   ```
3. Pre-migration backup check:
   ```bash
   pg_dump -U lms_user -h db.internal -d lms_prod -F c -b -v -f "/var/backups/pre_migrate_$(date +%Y%m%d_%H%M%S).dump"
   ```
4. Verify migration status without applying:
   ```bash
   npx prisma migrate status
   ```

---

## 7. Nginx Reverse Proxy, SSL/TLS & Security Headers

Create `/etc/nginx/sites-available/lms.conf`:
```nginx
# 1. HTTP Redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name lms.yourinstitution.edu api.lms.yourinstitution.edu;
    return 301 https://$host$request_uri;
}

# 2. Client Single Page Application (SPA)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name lms.yourinstitution.edu;

    ssl_certificate /etc/letsencrypt/live/lms.yourinstitution.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lms.yourinstitution.edu/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Enterprise Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    root /opt/lms/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}

# 3. API Backend Proxy
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.lms.yourinstitution.edu;

    ssl_certificate /etc/letsencrypt/live/api.lms.yourinstitution.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.lms.yourinstitution.edu/privkey.pem;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }
}
```
Enable the site and obtain SSL certificates:
```bash
sudo ln -s /etc/nginx/sites-available/lms.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d lms.yourinstitution.edu -d api.lms.yourinstitution.edu
```

---

## 8. Database Backup, Restore & Disaster Recovery Runbook

### 8.1 Automated Nightly Snapshot Script
Create `/usr/local/bin/backup_lms_database.sh`:
```bash
#!/bin/bash
set -e
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/lms"
ENCRYPTION_KEY_FILE="/etc/lms_backup.key"

mkdir -p "$BACKUP_DIR"

# Step 1: Dump PostgreSQL with full schema and data
pg_dump -h localhost -U lms_db_user -d lms_production -F c -b -f "$BACKUP_DIR/db_$TIMESTAMP.dump"

# Step 2: Encrypt with OpenSSL (AES-256)
openssl enc -aes-256-cbc -salt -in "$BACKUP_DIR/db_$TIMESTAMP.dump" \
  -out "$BACKUP_DIR/db_$TIMESTAMP.dump.enc" \
  -pass file:"$ENCRYPTION_KEY_FILE"
rm "$BACKUP_DIR/db_$TIMESTAMP.dump"

# Step 3: Retain 30 days locally, purge older
find "$BACKUP_DIR" -type f -name "*.enc" -mtime +30 -exec rm {} \;

echo "[$(date)] Backup completed successfully: db_$TIMESTAMP.dump.enc"
```
Schedule via root crontab (`crontab -e`):
```cron
0 2 * * * /usr/local/bin/backup_lms_database.sh >> /var/log/lms_backup.log 2>&1
```

### 8.2 In-App Snapshot Backup & Recovery Runbook
* **Authorized Roles**: `ROLE_SUPER_ADMIN`, `ROLE_INSTITUTION_ADMIN`.
* **Execution**: Trigger `GET /api/v1/system/backup` via UI Settings tab or CLI curl:
  ```bash
  curl -H "Authorization: Bearer <TOKEN>" https://api.lms.yourinstitution.edu/api/v1/system/backup -o institution_backup.json
  ```
* **Restore Drill Procedure**:
  1. Provision an isolated staging environment.
  2. Decrypt and restore the backup file:
     ```bash
     openssl enc -d -aes-256-cbc -in db_TIMESTAMP.dump.enc -out restored.dump -pass file:/etc/lms_backup.key
     pg_restore --clean --if-exists -h localhost -U lms_db_user -d lms_staging restored.dump
     ```
  3. Validate database consistency and run the verification test suite.

---

## 9. High Availability, Scaling & Performance Tuning

### 9.1 PostgreSQL Tuning (`postgresql.conf`)
* `shared_buffers = 4GB` (25% of total system RAM)
* `effective_cache_size = 12GB` (75% of total system RAM)
* `work_mem = 64MB`
* `maintenance_work_mem = 512MB`
* `max_connections = 150`
* `checkpoint_completion_target = 0.9`

### 9.2 Redis Memory Management (`redis.conf`)
* `maxmemory 3gb`
* `maxmemory-policy allkeys-lru`
* `appendonly yes`

---

## 10. Health Probes, Observability & Incident Response

### 10.1 Health Probes Matrix
| Endpoint | Method | Expected HTTP | Usage |
| :--- | :--- | :--- | :--- |
| `/api/v1/health` | `GET` | `200 OK` | Process liveness check. Confirms Express HTTP loop is running. |
| `/api/v1/health/ready` | `GET` | `200 OK` | Readiness check. Validates active database connection and schema health. |

### 10.2 Severity Levels & Incident SLAs
* **Severity 1 (Critical Outage)**: System completely unavailable or security breach detected. **SLA: < 15 minute response, < 1 hour resolution**.
* **Severity 2 (High Impairment)**: Exam mark upload failing, Fee payment webhook offline, or teacher assignment locks failing. **SLA: < 1 hour response, < 4 hours resolution**.
* **Severity 3 (Standard Bug)**: UI rendering glitch, non-blocking report export error. **SLA: < 24 hours resolution**.
