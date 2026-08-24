# Operations Runbook — MahaCred QR

Server-side operational guidance for health, readiness, database connectivity, provider integration, deployment, and incident response.

**External alert delivery (PagerDuty, Slack, email, Sentry, Datadog, etc.) = NOT IMPLEMENTED.**  
In-app operational notifications are not an external monitoring service.

---

## Operational logging model

| Concern | Mechanism |
|---------|-----------|
| Runtime diagnostics | Structured operational logs (`src/lib/observability`) |
| Business/security audit | Durable `AuditLog` records |

Operational logs are JSON-shaped, server-only, and pass through secret/privacy redaction. They do **not** replace `AuditLog`.

---

## Health failure (`GET /api/health`)

**Symptoms:** Load balancer reports process down.

**Response remains minimal:** `{ "status": "ok", "timestamp" }` when healthy.

**Actions:**

1. Verify application process is running (`npm run start` or platform process manager).
2. Check recent deployment/build logs (not health endpoint output).
3. Roll back application deployment if a bad release is suspected.
4. Do **not** expose stack traces or environment details via health responses.

---

## Readiness failure (`GET /api/ready`)

**Symptoms:** `503` with `{ "status": "unavailable", "reason": "configuration" | "dependency" }`.

**Public response stays generic.** Safe operational logs may record:

- `readiness_unavailable` (configuration)
- `readiness_dependency_failed` (database)

**Actions:**

1. Verify `DATABASE_URL` and `AUTH_SECRET` are configured (never log values).
2. Run `npm run db:migrate:status` and `npm run db:migrate:preflight`.
3. Run `npm run db:integrity:verify` after connectivity is restored.
4. See `docs/DATABASE_RECOVERY.md` for migration failure handling.

**Readiness constraints (must remain true):**

- Read-only (`SELECT 1` only)
- No migration, seed, repair, or SabPaisa calls

---

## Database connectivity issue

**Symptoms:** Readiness `dependency` failures, Prisma `P1001`, timeouts.

**Actions:**

1. Confirm Neon/project status in provider console.
2. Verify credentials were not rotated without redeploy.
3. Run `npm run db:migrate:preflight` (read-only).
4. Retry after brief cooldown for transient errors.

---

## Neon transient errors

Known transient operational classes:

| Code / symptom | Meaning |
|----------------|---------|
| `P1017` | Server closed connection |
| `P2028` | Transaction API error / connection issue |
| TLS / connection closure | Network or pool saturation |
| Timeout | Slow or unavailable database |

**Policy:**

- Do **not** immediately change payment processing code on first transient.
- Cool down and rerun affected verification suite in isolation.
- **Never** reset/drop production Neon to “fix” transients.
- Do **not** add automatic state-changing payment retries.

---

## Auth / configuration failure

**Symptoms:** Users cannot sign in; readiness `configuration`.

**Safe logs:** `authentication_failed`, `authorization_denied` — never passwords, cookies, or tokens.

**Actions:**

1. Verify `AUTH_SECRET` length and production placeholder policy.
2. Verify `APP_URL` / `AUTH_URL` when callbacks are required.
3. Review recent credential rotation.

---

## Provider integration blocked

Live SabPaisa remains **fail-closed** while blockers exist:

- API crypto interoperability (3 items BLOCKED)
- Webhook interoperability (4 items BLOCKED)
- Live credentials/onboarding unavailable

**Safe log codes may include:**

- `LIVE_INTEGRATION_NOT_READY`
- `ENCRYPTION_INTEROP_BLOCKED`
- `SABPAISA_WEBHOOK_SPEC_NOT_AVAILABLE`

**Never log** provider API keys, secrets, encryption keys, HMAC secrets, or raw webhook payloads.

`SABPAISA_MODE=mock` is the safe default. MOCK activity is **TEST**, not live collection.

---

## Deployment failure

See `docs/DEPLOYMENT_READINESS.md`.

**Safe order:**

1. Environment validation
2. `npm run db:migrate:preflight`
3. `npx prisma generate`
4. `npm run db:migrate:deploy`
5. `npm run db:migrate:status`
6. `npm run db:integrity:verify`
7. `npm run build`
8. `npm run start`
9. Health + readiness checks

**Never in production:** `migrate reset`, `force-reset`, `db:seed`.

---

## Migration failure

Pointer: `docs/DATABASE_RECOVERY.md`

1. **STOP** deployment.
2. Do not `migrate reset`.
3. Inspect `npm run db:migrate:status`.
4. Preserve database; use operator-reviewed recovery only.

---

## Suspicious authorization activity

1. Review `AuditLog` for cross-tenant access attempts.
2. Check operational `authorization_denied` logs (actor userId + resource type/id only).
3. Disable compromised accounts through admin user management.
4. Rotate credentials if exposure is suspected.

---

## Secret exposure incident

1. **Stop** further exposure (revoke log access if needed).
2. Rotate affected credentials immediately (`DATABASE_URL`, `AUTH_SECRET`, SabPaisa secrets).
3. Invalidate/revoke sessions where supported.
4. Review `AuditLog` and operational logs for misuse (without printing secrets).
5. Redeploy with replacement secrets stored outside Git.

---

## Payment event observability

Safe operational logs may include:

- `provider`, `providerMode` (MOCK must remain visible as TEST)
- `providerEventId`, `providerTransactionId` (identifiers only)
- processing outcome / failure code

**Never log:** raw webhook payload, signature, full Customer VPA, credentials.

Observability must **not** mutate payment truth (status, amount, provider mode, event replay).

---

## Correlation IDs

API operational logs may include `requestId` from `x-request-id` when valid (bounded, non-secret).  
Generated server-side when absent. Not used for authorization or payment identity.

---

## Related documentation

- `docs/DEPLOYMENT_READINESS.md`
- `docs/DATABASE_RECOVERY.md` (restore drill: **DOCUMENTED ONLY**)
- `docs/SABPAISA_LIVE_READINESS.md`
- `docs/PRODUCTION_RELEASE_CHECKLIST.md`
