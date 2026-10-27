# Deployment and Operations

> [!NOTE]
> For the complete, production-ready enterprise runbook, Nginx reverse proxy configurations, systemd services, automated backup crons, and zero-downtime database rollout, see [FULL_DEPLOYMENT_GUIDE.md](file:///d:/lms2/FULL_DEPLOYMENT_GUIDE.md).
> For the complete architectural overview, role matrix, and security audit, see [FULL_PROJECT_DOCUMENTATION.md](file:///d:/lms2/FULL_PROJECT_DOCUMENTATION.md).

## Readiness

The API liveness endpoint is `GET /api/v1/health`. It reports that the process can serve HTTP. The readiness endpoint is `GET /api/v1/health/ready`; it runs a trivial database query and returns HTTP 503 without connection details when PostgreSQL is unavailable. Configure the platform load balancer to use readiness for traffic routing and liveness for process restart decisions.

## Production environment

Set the following through the hosting platform's secret manager, never in source control:

- `NODE_ENV=production`
- `DATABASE_URL`: PostgreSQL connection URL with `sslmode=require` or stronger, to a dedicated production database
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: distinct, independently generated random secrets, at least 32 characters each
- `REPORT_CARD_SIGNING_SECRET`: independent random secret, at least 32 characters; keep it stable across releases or previously issued report-card verification signatures will no longer validate
- `COUNSELING_ENCRYPTION_SECRET`: independent random secret, at least 32 characters; retain protected backups and rotation procedures because changing it makes existing counseling notes unreadable
- `CLIENT_URL`: exact HTTPS origin for the deployed client
- `PORT`, `API_PREFIX`, `UPLOAD_DIR`, `MAX_FILE_SIZE_MB`, `LOG_LEVEL`

The API rejects production configuration with weak/default JWT secrets, a non-HTTPS client origin, or a database URL that does not require TLS. Treat the committed `.env.example` and `docker-compose.yml` as local-development fixtures only; their credentials are not production secrets. Do not expose a database port publicly. Store user uploads on durable encrypted storage with access controls and backups.

## Build, migration and release

1. Build and verify the exact release commit in CI.
2. Back up the database and verify the backup is readable before a schema change.
3. Deploy the server image/artifact and run `npm --prefix server run db:deploy` once as a release job using the production secret set. Do not run `migrate dev` in production.
4. Start the API and wait for `/api/v1/health/ready` to return HTTP 200.
5. Deploy the client assets to static hosting with the API base URL set for the same environment.
6. Verify login, tenant selection, critical workflows, error monitoring, and backup jobs before opening traffic.

This repository currently has a CI workflow, but no production hosting provider, container image, secret store, payment provider, or deployment credentials configured. CI passing does not mean the application has been deployed.

## Backup and restore

Use the managed PostgreSQL provider's encrypted point-in-time recovery where available. Otherwise, run `pg_dump --format=custom --no-owner --no-acl` from a secured operations host and encrypt the artifact before transfer/storage. Keep database backups and upload storage backups under separate access controls and retention policies. Never commit backup files.

For a restore drill, provision an isolated database, restore with `pg_restore --clean --if-exists --no-owner --no-acl`, validate migration state, run the seeded-independent smoke checks and critical workflow suite, then record recovery time and data-loss point. Never restore over production as part of a drill. Application rollback does not automatically reverse database migrations; use a forward fix or restore a verified backup according to the incident plan.

## Monitoring and incident handling

Collect structured application logs with secret/credential redaction, process restarts, HTTP 5xx rates, latency, readiness, PostgreSQL health, storage capacity, and backup completion. Alert on sustained readiness failures, authentication spikes, unusual cross-tenant denials, financial workflow errors, and failed backups. Restrict audit and counseling data access; avoid logging message bodies, counseling notes, tokens, or payment credentials. Define an on-call owner, escalation path, retention periods, and recovery objectives before production use.

## Current limitations

- No deployment has been performed or verified.
- The CI workflow is committed but has not run on a hosted CI service in this environment.
- End-to-end browser automation, backup restoration, load testing, WCAG audit, and production observability integration remain outstanding.
- Payment gateway processing is not configured; online payment/refund requests are rejected.
- Pending schema migrations must be applied only to a confirmed target environment after backup.
