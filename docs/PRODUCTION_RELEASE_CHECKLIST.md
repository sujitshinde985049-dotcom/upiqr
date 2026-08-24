# Production Release Checklist — MahaCred QR

Use this checklist before a **controlled application deployment**.  
**Application deployment readiness ≠ SabPaisa LIVE readiness.**

---

## Pre-release

- [ ] Approved commit identified and tagged/referenced
- [ ] Working tree clean on release branch
- [ ] Environment variables configured from `.env.example` (placeholders only in repo)
- [ ] Secrets stored outside Git (platform secret manager)
- [ ] `SABPAISA_MODE` explicitly verified as **`mock`** for safe deployment
- [ ] `NODE_ENV=production` does **not** imply `SABPAISA_MODE=live`
- [ ] Database backup/recovery procedure reviewed (`docs/DATABASE_RECOVERY.md`)
- [ ] Restore drill status acknowledged: **DOCUMENTED ONLY** (unless isolated restore evidence exists)
- [ ] External monitoring/alert delivery acknowledged: **NOT IMPLEMENTED**

---

## Database

- [ ] `npm run db:migrate:status` — schema up to date, no failed migration
- [ ] `npm run db:migrate:preflight` — PASS
- [ ] `npm run db:integrity:verify` — PASS (review any reported anomalies)
- [ ] **Do not** run `prisma migrate reset`, `force-reset`, or `db:seed` in production

---

## Deploy

- [ ] Install dependencies (`npm ci` or controlled `npm install`)
- [ ] `npx prisma generate`
- [ ] `npm run db:migrate:deploy`
- [ ] `npm run build`
- [ ] `npm run start` (or platform equivalent)

---

## Post-deploy verification

- [ ] `GET /api/health` → `{ "status": "ok" }`
- [ ] `GET /api/ready` → `{ "status": "ready" }` when database reachable
- [ ] Auth smoke test (login/logout)
- [ ] Tenant isolation smoke test (cross-tenant access denied)
- [ ] MOCK/LIVE labeling check — MOCK/TEST visible; no live collection claims
- [ ] Operational log review — no secrets/passwords/VPA/credentials in logs
- [ ] Rollback decision point documented if smoke tests fail

---

## Explicit blockers (must remain until resolved)

- [ ] **SABPAISA LIVE MUST NOT BE ENABLED** until:
  - API crypto interoperability (3 BLOCKED) resolved
  - Webhook interoperability (4 BLOCKED) resolved
  - Live credentials/onboarding complete
- [ ] No public SabPaisa webhook
- [ ] No settlement/reconciliation/refund/payout features enabled

---

## GO / NO-GO

| Category | Allowed status after checklist |
|----------|-------------------------------|
| **Application deployment readiness** | READY FOR CONTROLLED DEPLOYMENT (if all gates pass) |
| **SabPaisa LIVE payment readiness** | **BLOCKED** (until provider blockers resolved) |

---

## Related docs

- `docs/DEPLOYMENT_READINESS.md`
- `docs/DATABASE_RECOVERY.md`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/SABPAISA_LIVE_READINESS.md`
