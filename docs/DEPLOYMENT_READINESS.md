# Deployment Readiness — MahaCred QR

This document describes how to deploy the application safely to a production-like environment.

**Production deployment readiness does not mean SabPaisa LIVE readiness.** The application can and should run in `SABPAISA_MODE=mock` until provider onboarding and interoperability are complete.

## Prerequisites

- Node.js 20+ (match local development runtime)
- npm (project package manager)
- Neon PostgreSQL database (or compatible PostgreSQL)
- Environment variables configured from `.env.example` (never commit real secrets)

## Required environment variables

| Variable | Required | Secret | Notes |
|----------|----------|--------|-------|
| `DATABASE_URL` | Yes | Yes | Neon/PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Yes | Min 32 chars; no dev placeholders in production |
| `SABPAISA_MODE` | Yes | No | Default `mock`; LIVE remains fail-closed |
| `NODE_ENV` | Recommended | No | Set `production` in production runtime |
| `APP_URL` / `AUTH_URL` | Optional | No | Canonical HTTPS origin when needed for auth callbacks |
| SabPaisa LIVE vars | Only for blocked live path | Yes | Not required while `SABPAISA_MODE=mock` |

Mock fixture flags (`ALLOW_MOCK_*`) must remain **disabled** in production.

## Safe deployment order

1. Check out the release commit on the deployment host/CI.
2. Install dependencies: `npm ci` (or `npm install` in controlled environments).
3. Validate environment variables (missing/invalid config must fail closed).
4. Run migration preflight: `npm run db:migrate:preflight`
5. Generate Prisma client: `npx prisma generate`
6. Apply migrations: `npm run db:migrate:deploy` (or `npx prisma migrate deploy`)
7. Verify migration status: `npm run db:migrate:status`
8. Run post-deploy integrity check: `npm run db:integrity:verify`
9. Build application: `npm run build`
10. Start application: `npm run start`
11. Verify liveness: `GET /api/health` → `{ "status": "ok" }`
12. Verify readiness: `GET /api/ready` → `{ "status": "ready" }` when database is reachable

`npm run build` must **not** mutate the production database. Schema generation is not a migration.

## Commands that must NOT be used in production

- `prisma migrate dev`
- `prisma migrate reset`
- `prisma db push --force-reset`
- Any command that drops/recreates the database

## Rollback principles

- Application rollback (redeploy previous build) is separate from database rollback.
- **Never** use `migrate reset` to roll back production.
- Do not delete production data.
- Prefer forward-fix additive migrations when schema changes are required.

## Health vs readiness

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Process is running (no dependency checks) |
| `GET /api/ready` | Core DB-backed functionality available (read-only `SELECT 1`) |

SabPaisa LIVE availability is **not** required for readiness while operating in MOCK mode.

## Security notes

- Secrets remain server-only; never use `NEXT_PUBLIC_` for secrets.
- Health/readiness responses are intentionally minimal and must not expose credentials, connection strings, or business metrics.
- Security headers are configured in `next.config.ts` (frame protection, MIME sniffing, referrer policy, permissions policy).
- Content Security Policy is not enabled globally yet (requires nonce/hash work to avoid breaking Next.js).

## SabPaisa LIVE status

See `docs/SABPAISA_LIVE_READINESS.md`. LIVE activation remains blocked pending:

- Official crypto interoperability details/helper
- Official webhook payload/signature/replay specification
- Live credentials/onboarding

Setting `SABPAISA_MODE=live` alone does **not** make the system live-ready.

## Database deployment and recovery

See `docs/DATABASE_RECOVERY.md` for:

- Migration preflight and post-deploy integrity verification
- Backup and restore procedures (restore drill: **DOCUMENTED ONLY**)
- Migration failure handling and immutability rules
- Seed/verification safety (`db:seed` must **not** run in production)

Verification suites mutate Neon test data. Do **not** run them against an actual production database. Use `DB_PRODUCTION_GUARD=true` or `NODE_ENV=production` (without `ALLOW_DB_TEST_MUTATIONS=true`) to block mutating scripts when explicitly configured.
