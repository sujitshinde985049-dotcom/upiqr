# Database Recovery — MahaCred QR

Operational runbook for Prisma/Neon database deployment, backup, restore, and incident response.

**This document describes procedures.** It does not claim that a backup or restore drill has been performed unless an operator records that separately.

---

## Purpose

Provide a safe, deterministic database lifecycle:

```text
Prisma schema/migrations
        ↓
Migration preflight
        ↓
prisma migrate deploy
        ↓
Post-deploy integrity verification
        ↓
Backup/recovery procedure
        ↓
Incident-safe runbook
```

Database recovery tooling is **operational tooling**, not financial workflow. It must not mutate payment truth.

---

## Production safeguards

### Allowed in production deployment

- `npx prisma generate`
- `npx prisma migrate deploy`
- `npm run db:migrate:status`
- `npm run db:migrate:preflight` (read-only checks)
- `npm run db:integrity:verify` (read-only checks)
- `GET /api/health` and `GET /api/ready` (read-only; readiness does not migrate/seed/repair)

### Never use in production

- `prisma migrate dev`
- `prisma migrate reset`
- `prisma db push --force-reset`
- `npm run db:seed` (development/demo data only)
- `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE`
- Restoring a backup **directly over** the current production database as a first action

`npm run build` must **not** migrate, seed, reset, or truncate the database.

---

## Migration deployment procedure

1. Check out the release commit.
2. Validate environment (`DATABASE_URL`, `AUTH_SECRET`, etc.).
3. Run preflight: `npm run db:migrate:preflight`
4. Apply migrations: `npm run db:migrate:deploy` (alias for `prisma migrate deploy`)
5. Verify status: `npm run db:migrate:status` → database schema is up to date
6. Run integrity verification: `npm run db:integrity:verify`
7. Build and start application (separate from migration step).
8. Confirm `GET /api/ready` returns ready when database is reachable.

### Migration immutability

Prisma tracks migration history and checksums in `_prisma_migrations`.

- Already-applied migration SQL files must **not** be edited.
- Do not delete migration history directories from the repository.
- If Prisma reports drift or checksum mismatch, **STOP** and investigate before proceeding.

### Migration failure handling

If `prisma migrate deploy` fails:

1. **STOP** further deployment steps.
2. Do **not** run `prisma migrate reset`.
3. Inspect status: `npm run db:migrate:status`
4. Preserve the database; do not truncate or drop data to “fix” the failure.
5. Diagnose the failed migration with an operator who understands the actual DB state.
6. Use Prisma-supported production recovery only after review (for example `prisma migrate resolve` when appropriate and understood — **not automatic**).
7. Prefer forward-fix additive migrations when possible.

---

## Post-deploy validation

After migration deploy:

```bash
npm run db:integrity:verify
```

Read-only checks include:

- User → Client, Merchant → Client, MERCHANT_USER → Merchant alignment
- QR → Merchant and tenant alignment
- Transaction → QR/Merchant/Client alignment
- PaymentEvent relationship integrity
- ClientSettings, Notification, NotificationRead integrity

Anomalies are **reported**, not auto-deleted or auto-repaired.

Financial fields (`Transaction.amount`, `Transaction.status`, `PaymentEvent` processing state, QR payment fields) are never modified by verification tooling.

---

## Backup procedure

### What backups contain (sensitive)

Database backups may include:

- User accounts and audit records
- Merchant and client data
- Customer VPA/payment-related fields
- Transaction and PaymentEvent records

Treat all backup artifacts as **highly sensitive**. Do not commit them to Git.

### Supported approaches

#### 1. Neon provider capabilities

Neon supports point-in-time recovery and branching (provider-managed). Use the Neon console/API for:

- Creating a recovery branch from a point in time
- Cloning to an isolated environment for investigation

Refer to Neon documentation for RPO/RTO capabilities available on your plan.

#### 2. PostgreSQL logical backup (`pg_dump`)

Operator command example (run from a secure operator environment):

```bash
pg_dump "$DATABASE_URL" --format=custom --file=mahacred-backup-$(date +%Y%m%d-%H%M%S).dump
```

- Never hardcode credentials in scripts or documentation.
- Store backups in encrypted, access-controlled storage.
- Define retention policy externally (business/ops decision).

**Documented procedure only** — creating a backup is an operator action, not something the application runs automatically.

### Backup storage security

- Encrypt backup files at rest.
- Restrict access to operators with a need to know.
- Do not store backups in the application repository.
- Rotate and expire backups per organizational policy.

---

## Restore procedure

### Policy

- **Do not** restore directly over the current production database as the default first action.
- Restore verification must use an **isolated disposable database or Neon branch** when infrastructure is available.
- The current production-like Neon database used by this project must remain untouched during restore drills in development of this runbook.

### Controlled restore steps

1. Identify target environment (must be isolated/disposable).
2. Confirm backup source and integrity.
3. Restrict application writes during a real recovery event if necessary.
4. Restore backup to the **isolated** target (not current production).
5. Run `npm run db:migrate:status`
6. Run `npm run db:integrity:verify`
7. Run application smoke/readiness checks against the isolated target.
8. Only after operator approval, plan any production cutover separately.

Example operator restore concept:

```bash
pg_restore --clean --if-exists --dbname="$ISOLATED_DATABASE_URL" mahacred-backup.dump
```

### Restore drill status

For this project phase: **DOCUMENTED ONLY**

No restore was performed against the current Neon database during Phase 8 Part 2.

---

## RPO / RTO

| Metric | Meaning | Target |
|--------|---------|--------|
| **RPO** (Recovery Point Objective) | Acceptable data-loss window | **TBD — business decision** |
| **RTO** (Recovery Time Objective) | Acceptable recovery time | **TBD — business decision** |

Neon plan features and organizational backup policy determine achievable RPO/RTO. Do not invent SLA numbers in application code.

---

## Application rollback vs database rollback

- Reverting application code (redeploy previous build) does **not** automatically reverse database migrations.
- Prefer additive, backward-compatible migrations.
- Do not delete migration history or edit already-applied migration SQL.
- Destructive migration recovery may require forward fix, controlled restore to isolated environment, or provider recovery — operator decision.

---

## Schema change review checklist

Before merging a new Prisma migration:

- [ ] Additive vs destructive change identified
- [ ] Nullable → required transition planned with backfill/default
- [ ] Unique constraints reviewed for existing data conflicts
- [ ] Foreign keys and `onDelete` behavior reviewed
- [ ] Index creation impact on large tables considered
- [ ] Table/column rename strategy documented
- [ ] Column type conversion risk assessed
- [ ] Application compatibility across deploy order verified
- [ ] Rollback/recovery plan documented (forward fix vs restore)
- [ ] Destructive SQL flagged and explicitly reviewed

Use `scanMigrationSqlForDestructiveOperations` inventory/report for review; historical migrations may contain reviewed operations.

---

## Data-integrity incident handling

1. Run `npm run db:integrity:verify` and capture anomaly counts.
2. Do **not** auto-delete or auto-repair financial records.
3. Investigate tenant-scoping anomalies (cross-client transaction/QR mismatches, etc.).
4. Escalate with audit trail; use isolated copy/branch for forensic analysis when possible.

---

## Credential exposure handling

If `DATABASE_URL` or backup credentials are exposed:

1. Rotate credentials immediately (Neon/console).
2. Update deployment secrets; never commit credentials.
3. Review access logs.
4. Treat backups containing the exposed window as sensitive.

Never log `DATABASE_URL`, usernames, passwords, or connection credentials in application or verification output.

---

## Seed and verification safety

- `prisma/seed.ts` is **development/demo only**. It deletes and recreates mock data. **Never run against production.**
- Neon-backed verification suites (`npm run test:phase*`) mutate test data. **Do not run against an actual production database.**
- Set `DB_PRODUCTION_GUARD=true` or run with `NODE_ENV=production` (without `ALLOW_DB_TEST_MUTATIONS=true`) to block mutating verification scripts when explicitly configured.

---

## SabPaisa provider safety

Database operations do not affect SabPaisa LIVE activation policy:

- `SABPAISA_MODE=mock` remains the safe default
- API crypto interoperability: **3 BLOCKED**
- Webhook interoperability: **4 BLOCKED**
- No live SabPaisa API calls from database tooling

---

## Related documentation

- `docs/DEPLOYMENT_READINESS.md` — application deployment order
- `docs/SABPAISA_LIVE_READINESS.md` — live provider activation (still blocked)
