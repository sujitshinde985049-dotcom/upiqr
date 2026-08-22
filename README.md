# MahaCred QR

**Multi-Tenant Merchant Payment Platform** — a professional admin web application for Banks, Cooperative Banks, Patsansthas, and financial institutions to manage QR-based UPI payments for their merchant account holders.

## Business Hierarchy

```text
MahaCred Super Admin
        ↓
Bank / Patsanstha (Client / Tenant)
        ↓
Client Users (Admin / Operator)
        ↓
Current Account Holder Merchant
        ↓
Merchant User
        ↓
QR Code (Phase 4 — SabPaisa)
        ↓
SabPaisa Provider Abstraction
        ↓
Transactions (Phase 5 Part 1 — MOCK foundation)
```

Every record follows strict multi-tenant ownership:

- **Merchant** → `clientId`
- **QR Code** → `clientId` + `merchantId`
- **Transaction** → `clientId` + `merchantId` + `qrId`
- **Merchant User** → `clientId` + `merchantId` (must match merchant tenant)

## Tech Stack

- **Next.js 16** (App Router) with TypeScript (strict)
- **PostgreSQL (Neon)** + **Prisma ORM 7**
- **Auth.js / NextAuth v5** (Credentials provider, JWT sessions)
- **bcryptjs** password hashing
- **Tailwind CSS** + **shadcn/ui**
- **Lucide React**, **Recharts**, **Zod**, **React Hook Form**

## Phase 3 — Complete

Phase 3 delivers database-backed onboarding and RBAC workflows. **SabPaisa, live QR creation, and payment processing are NOT part of Phase 3** — they are planned for Phase 4.

### Bank / Patsanstha Onboarding (Part 1)

- Server-generated client codes (`CLT000001`, …)
- Create, edit, activate, deactivate, reactivate clients
- Default status `PENDING` on creation
- Paginated list with search, type/status filters
- Client detail with Users tab and Activity/Audit records
- Platform-level client management: **SUPER_ADMIN only**

### Merchant Onboarding (Part 2)

- Create merchants under the correct Bank/Patsanstha tenant
- Server-generated merchant codes (`MER000001`, …)
- Current account mapping with tenant-scoped uniqueness
- Account reference masking in list, detail, and audit metadata
- Duplicate current account protection per client
- Edit merchant — `clientId` cannot be changed
- Activate / deactivate / reactivate workflow
- Paginated list with search, filters, sorting
- Merchant detail with Users tab and Activity/Audit records

### Client & Merchant User Management (Part 3)

- Create `CLIENT_ADMIN`, `CLIENT_OPERATOR`, and `MERCHANT_USER` with server-side RBAC
- Paginated `/users` list with search, role, status, and client filters
- Privilege escalation protection (no SUPER_ADMIN assignment by CLIENT_ADMIN)
- Passwords hashed with bcrypt — never exposed in UI, API responses, or audit logs
- Email uniqueness with graceful duplicate handling

### RBAC & Tenant Isolation

| Role | Scope |
|------|-------|
| `SUPER_ADMIN` | Full platform access across all tenants |
| `CLIENT_ADMIN` | Own client + merchants, users, settings |
| `CLIENT_OPERATOR` | Own client — operational access, no user admin |
| `MERCHANT_USER` | Own merchant only — QRs and transactions |

Tenant scope is enforced **server-side** in services and server actions. Navigation visibility is UX-only and filtered by role in the sidebar.

### Audit Logging

Recorded actions include:

- `CLIENT_CREATED`, `CLIENT_UPDATED`, `CLIENT_ACTIVATED`, `CLIENT_DEACTIVATED`
- `MERCHANT_CREATED`, `MERCHANT_UPDATED`, `MERCHANT_ACTIVATED`, `MERCHANT_DEACTIVATED`
- `CLIENT_USER_CREATED`, `CLIENT_USER_STATUS_CHANGED`
- `MERCHANT_USER_CREATED`, `MERCHANT_USER_STATUS_CHANGED`

Audit metadata never includes passwords, hashes, tokens, secrets, or full current account references.

### Current Account Security

- Full account reference shown only on merchant **edit** forms (authorized roles)
- List and detail views use masked references (`XXXXXXXXX4582`)
- Audit logs store masked account references only
- Sensitive payment credentials (ATM PIN, UPI PIN, CVV, OTP, net banking passwords) are never collected or stored

### QR & SabPaisa (Phase 4 — TEST/MOCK Complete)

- Full mock SabPaisa QR workflow: create, list, detail, update, deactivate, reactivate, PNG/SVG download
- **Generate QR** creates **TEST/MOCK** records via `SABPAISA_MODE=mock` — no live SabPaisa API call
- Mock QRs are **TEST / NOT PAYABLE** in UI, database (`providerMode=MOCK`), and downloads
- Live SabPaisa integration is **NOT enabled** — see `docs/SABPAISA_LIVE_READINESS.md`

## Phase 4 — SabPaisa TEST/MOCK Integration (COMPLETE)

**SabPaisa production/live integration is NOT enabled.**  
Live activation requires SabPaisa onboarding credentials and official encryption interoperability.

```text
Application/UI → qr-service.ts → SabPaisaQRProvider
                                    ├── MockSabPaisaQRProvider (active)
                                    └── LiveSabPaisaQRProvider (disabled, fail-closed)
```

| Part | Scope | Status |
|------|-------|--------|
| Part 1 | Foundation (config, auth, encryption layout, HTTP client, errors) | Complete |
| Part 2 | Mock QR create (SabQR v2.1 contract) | Complete |
| Part 3 | Mock QR management (list/detail/update/deactivate/reactivate/download) | Complete |
| Final | E2E mock workflow, live-readiness verification, documentation | Complete |

### Part 1 — Integration Foundation (complete)

Server-only SabPaisa foundation under `src/lib/sabpaisa/`:

- Environment configuration (`SABPAISA_ENV`, `SABPAISA_BASE_URL`, API credentials, encryption keys)
- Secure credential loading from environment variables only
- `getSabPaisaHeaders()` — `X-API-Key`, `X-API-Secret`, `Content-Type: application/json`
- Encrypted request/response envelope types (`{ encrypted: true, data: "..." }`)
- HTTP client foundation with timeout, error normalization, encrypted response detection
- Payment rail identifier validation helpers (`hdfc`, `icici`)
- Foundation tests: `npm run test:sabpaisa-foundation`

**Environment variables (names only — never commit values):**

| Variable | Purpose |
|----------|---------|
| `SABPAISA_ENV` | `staging` (default) or `production` |
| `SABPAISA_BASE_URL` | SabPaisa API base URL (HTTPS) |
| `SABPAISA_API_KEY` | Server-side API key |
| `SABPAISA_API_SECRET` | Server-side API secret |
| `SABPAISA_ENCRYPTION_MASTER_KEY` | 64-char hex (32 bytes) |
| `SABPAISA_ENCRYPTION_HMAC_SECRET` | 96-char hex (48 bytes) |
| `SABPAISA_MODE` | `mock` (default) or `live` — live disabled until onboarding complete |

**No live SabPaisa QR API call is performed in Phase 4 Part 1.**  
`POST /api/v2/qr` is not implemented. Encryption encrypt/decrypt interoperability is **blocked** until SabPaisa-provided PBKDF2/HMAC derivation details are available from the official SabQR v2.1 helper.

### Part 2 — SabPaisa Contract Mock QR (complete)

Full TEST QR generation workflow using a SabPaisa-compatible **mock adapter**:

```text
Merchant → Generate QR UI → Server Auth → RBAC → Tenant Check
         → Request Validation → SabPaisa QR Service → Mock Provider
         → SabPaisa-compatible response → Neon QR record → QR Detail UI
```

**Integration mode** (`SABPAISA_MODE`):

| Value | Behavior |
|-------|----------|
| `mock` (default) | In-process mock provider; no network request to SabPaisa |
| `live` | **Disabled** — fails with `LIVE_INTEGRATION_NOT_READY` until credentials and official encryption interoperability are available |

**Never silently falls back from `live` to `mock`.**

**Provider abstraction** (`src/lib/sabpaisa/providers/`):

- `MockSabPaisaQRProvider` — implements SabQR API v2.1 create response contract
- `LiveSabPaisaQRProvider` — prepared but throws `LIVE_INTEGRATION_NOT_READY`
- `getSabPaisaQRProvider()` — factory used by `qr-service.ts`

**Mock QR characteristics:**

- Provider IDs use `mock_qr_...` prefix
- VPA/UPI strings use clearly synthetic test patterns (e.g. `*.mahacred.invalid`, `mahacred-test://qr/not-payable/...`)
- `isPayable=false` on all mock records
- `providerMode=MOCK` stored in database for reporting separation
- QR images use local test placeholder — not a live `upi://pay` destination

**Database:** `QRCode` model extended with `provider`, `providerMode`, `upiString`, `notes`, `isPayable`, `providerCreatedAt`, `idempotencyKey`.

**Tests:**

```bash
npm run test:qr-provider-contract  # SabPaisa create response + error normalization
npm run test:qr-mock-security      # RBAC, tenant isolation, validation, idempotency
```

**Not implemented in Part 2:** live SabPaisa HTTP calls, webhooks, transactions, settlement, reconciliation, bulk QR.

### Part 3 — Mock QR Management (complete)

SabQR API v2.1 management operations in **mock mode** — no live SabPaisa HTTP requests:

| Operation | Contract reference | MahaCred implementation |
|-----------|-------------------|-------------------------|
| List | `GET /api/v2/qr` | Server-side pagination, search, filters, tenant scope |
| Details | `GET /api/v2/qr/:qr_id` | QR detail page |
| Update | `PUT /api/v2/qr/:qr_id` | Edit dialog; immutable VPA/merchant/client/provider fields |
| Deactivate | `DELETE /api/v2/qr/:qr_id` | Soft deactivate (`status=inactive`); pending txn guard |
| Reactivate | `POST /api/v2/qr/:qr_id/activate` | Restore active status without duplicate record |
| Download | `GET /api/v2/qr/:qr_id/download` | PNG/SVG test artifacts via `/api/qr/[id]/download` |

**Download safety:**

- PNG/SVG encode `MAHACRED_TEST_QR:<localId>` — **NOT** a payable `upi://pay` destination
- PDF rejected with `FORMAT_NOT_SUPPORTED` (per SabPaisa documentation)
- Filename pattern: `test_qr_<id>.png`
- All mock downloads marked TEST / NOT PAYABLE

**Audit events:** `QR_UPDATED`, `QR_DEACTIVATED`, `QR_REACTIVATED`, `QR_DOWNLOADED`

**Tests:**

```bash
npm run test:qr-management  # List, update, deactivate, reactivate, download, RBAC
```

**Not implemented in Part 3:** regenerate, QR transactions API, QR analytics, webhooks, settlement, live SabPaisa calls.

### Phase 4 Final Verification

**Live mode fail-closed:** `SABPAISA_MODE=live` throws `LIVE_INTEGRATION_NOT_READY` — no silent mock fallback, no unencrypted requests, no live HTTP during fail-closed checks.

**Crypto interoperability:** encrypt/decrypt/tamper tests remain **BLOCKED** (3) until official SabPaisa helper/spec.

**Live readiness checklist:** `docs/SABPAISA_LIVE_READINESS.md`

**Phase 4 test suite:**

```bash
npm run test:phase4-e2e-mock     # End-to-end mock workflow (Client → Merchant → QR lifecycle)
npm run test:phase4-final        # Live-readiness, secrets, isolation, DB integrity
npm run test:qr-management       # QR management RBAC + operations
npm run test:qr-mock-security    # QR create security
npm run test:qr-provider-contract # SabQR v2.1 contract shape
npm run test:sabpaisa-foundation # Foundation (17 PASS + 3 BLOCKED crypto)
```

**Production policy note:** Deactivating a Client or Merchant does not hard-delete existing QR/transaction history records. New QR creation requires active Client and Merchant.

## Phase 5 Part 1 — Transaction Foundation (COMPLETE)

**Live SabPaisa transaction API is NOT enabled.**  
**Webhook payment confirmation is NOT implemented.**

```text
Application/UI → transaction-service.ts → SabPaisaTransactionProvider
                                              ├── MockSabPaisaTransactionProvider (active)
                                              └── LiveSabPaisaTransactionProvider (disabled, fail-closed)
```

### SabPaisa transaction contract (reference only)

Documented read endpoints modeled in `src/lib/sabpaisa/transaction-types.ts`:

- `GET /api/v2/transactions` — pagination uses `totalPages`
- `GET /api/v2/qr/:qr_id/transactions` — pagination uses `total_pages`

No network request occurs in `SABPAISA_MODE=mock`.

### Local transaction mapping

Prisma `Transaction` records map tenant ownership, provider metadata, and monetary fields:

- `clientId`, `merchantId`, `qrId` resolved server-side from QR relationships
- `provider`, `providerMode`, `providerTransactionId` with uniqueness on `(provider, providerMode, providerTransactionId)`
- `amount` stored as `Decimal(12,2)` — not JavaScript float
- `referenceNumber`, `bankReferenceNumber`, `customerVpa`, `customerName`, `paymentMethod`, `railId`, timestamps

Legacy seeded transactions remain `providerMode=LEGACY` and are **not** classified as live payments.

### Mock/test transactions

- Generated only via `src/lib/test-fixtures/mock-transaction-fixture.ts` (requires `ALLOW_MOCK_TRANSACTION_FIXTURES=true` outside production)
- Synthetic IDs such as `mock_txn_*`, VPA `test-customer@mock`, references prefixed `MOCK-*`
- UI shows **TEST/LEGACY** badges — mock data is **not proof of real payment**
- No manual transaction edit workflow (amount/status/QR/merchant/client are immutable for normal users)

### Tenant security

- `SUPER_ADMIN` — platform-wide reads
- `CLIENT_ADMIN` / `CLIENT_OPERATOR` — own client only
- `MERCHANT_USER` — own merchant only
- Customer VPA masked in list views; not written to audit metadata for fixture creation

### Phase 5 Part 1 test suite

```bash
npm run test:transaction-provider-contract  # SabPaisa transaction contract shape (8/8)
npm run test:phase5-part1                   # Transaction foundation + security (35/35)
```

**Not implemented in Part 1:** live transaction API reads over HTTP, settlement, reconciliation, refunds, reports/export, analytics.

## Phase 5 Part 2 — Payment Event/Webhook Foundation (COMPLETE)

**Real SabPaisa payment webhook endpoint is NOT enabled.**  
SabQR API Documentation v2.1 documents transaction **read** APIs only — not a complete payment webhook contract.

```text
MOCK Payment Event (test/dev only)
        ↓
Mock adapter → Normalized Payment Event
        ↓
Transaction Event Processor (idempotency + state machine)
        ↓
Neon Transaction + PaymentEvent record
        ↓
Safe audit metadata

Future:
SabPaisa (official webhook spec) → SabPaisaWebhookAdapter (currently fail-closed)
        ↓
SAME Transaction Event Processor
```

### Implemented in Part 2

- Provider-neutral normalized payment event model (`src/lib/payment-events/`)
- `PaymentEvent` processing/idempotency table with uniqueness on `(provider, providerMode, providerEventId)`
- Internal transaction state machine (`pending`/`success`/`failed` with terminal success/failed)
- MOCK event ingress via `src/lib/test-fixtures/mock-payment-event-fixture.ts` only
- QR ownership resolved from database — never from external event tenant fields
- Amount mismatch / QR mismatch / invalid transition rejection
- Audit actions: `PAYMENT_EVENT_PROCESSED`, `PAYMENT_EVENT_REJECTED` (no customer VPA in metadata)

### BLOCKED until official SabPaisa webhook specification

- Real webhook payload contract
- Signature verification
- Provider replay-window verification
- Public `/api/webhooks/sabpaisa` production endpoint

`SabPaisaWebhookAdapter` fails closed with `SABPAISA_WEBHOOK_SPEC_NOT_AVAILABLE`.

### Phase 5 Part 2 test suite

```bash
npm run test:phase5-part2   # Payment event security + idempotency
```

**Not implemented in Part 2:** live webhook endpoint, settlement, reconciliation, refunds, reports, analytics, Phase 5 Part 3.

## Phase 5 Part 3 — Transaction Management (COMPLETE)

Neon-backed transaction list and detail pages with tenant-safe RBAC, server-side filters, summary metrics, and CSV export.

### Features

- **`/transactions`** — server-side search, filter, sort, and pagination (max page size 100)
- **`/transactions/[id]`** — read-only transaction detail with masked Customer VPA
- **Summary metrics** — total/success/pending/failed counts and successful amount (Decimal aggregation)
- **MOCK / LEGACY / LIVE separation** — provider mode badges, separate successful-amount buckets; MOCK/LEGACY excluded from LIVE financial reporting
- **Client / Merchant / QR detail** — scoped transaction tabs reuse shared transaction components
- **CSV export** — `/api/transactions/export` with same tenant authorization and filters (max 10,000 rows, no VPA, formula-injection protection)
- **Reconciliation foundation** — computed internal status (`NOT_APPLICABLE` for MOCK/LEGACY, `UNVERIFIED` for LIVE); no live SabPaisa reconciliation

### Important terminology

- **Payment success does not imply settlement.**
- **MOCK/LEGACY data is excluded from LIVE financial reporting.**
- Payment status, event processing status, and reconciliation status are separate concepts.
- Transactions are immutable from the UI — no manual status edits or “Mark as Success”.

### Phase 5 Part 3 test suite

```bash
npm run test:phase5-part3   # Transaction management security + filters + CSV
```

**Not implemented in Part 3:** live SabPaisa reconciliation, settlement, refunds, live webhook.

## Phase 5 — TEST/MOCK Transaction Integration (COMPLETE)

Phase 5 delivers the full **TEST/MOCK** payment flow:

```text
SUPER_ADMIN → Client → Merchant → TEST QR
  → MOCK Payment Event → Normalized Event
  → Idempotent Processor → Neon Transaction
  → Transaction Management → Client/Merchant/QR Views
  → Summary Metrics → Authorized CSV Export
```

### Covered in Phase 5

- Transaction foundation (MOCK provider, RBAC, SabPaisa read contracts)
- Secure payment event processor (idempotency, state machine, amount/QR mismatch rejection)
- Tenant-safe transaction list, detail, filters, metrics, CSV export
- MOCK / LEGACY / LIVE financial separation
- Payment success ≠ settlement (no settlement claims without settlement data)
- Live providers and real webhook remain **fail-closed / BLOCKED**

### Phase 5 test suites

```bash
npm run test:phase5-part1   # Transaction foundation
npm run test:phase5-part2   # Payment event security
npm run test:phase5-part3   # Transaction management
npm run test:phase5-final   # End-to-end MOCK integration + security
```

See `docs/PHASE5_STATUS.md` for capability matrix and `docs/SABPAISA_LIVE_READINESS.md` for LIVE activation requirements.

**Not implemented:** live payment ingestion, real webhook, settlement, live reconciliation, refunds.

## Phase 6 Part 1 — Real Dashboard Metrics (COMPLETE)

The dashboard is now a **Neon-backed operational dashboard** with tenant-scoped RBAC:

```text
Neon PostgreSQL → Dashboard Service → RBAC + Tenant Scope → Dashboard Metrics
  → Recent Transactions → QR / Merchant operational overview → Role-specific UI
```

### Covered in Phase 6 Part 1

- Server-only `dashboard-service.ts` with Prisma `count` / `aggregate` / `groupBy` (no browser-side financial math)
- Role-specific metrics: `SUPER_ADMIN`, `CLIENT_ADMIN`, `CLIENT_OPERATOR`, `MERCHANT_USER`
- Transaction status breakdown (success / pending / failed)
- **Successful Amount** = successful transaction amount only (`status = success`); **not settlement**
- MOCK / LEGACY / LIVE separation with explicit TEST and LEGACY labels
- Date windows: Today, Last 7 Days, Last 30 Days (server-validated)
- Recent authorized transactions (limited, newest first, links to `/transactions/[id]`)
- QR and merchant operational overviews
- Customer VPA not displayed on dashboard; masked when present in service payloads

**MOCK and LEGACY amounts are not LIVE collections.** Payment success does not imply settlement.

### Phase 6 Part 1 test suite

```bash
npm run test:phase6-part1   # Dashboard metrics + tenant isolation + financial safety
```

**Not implemented in Part 1:** advanced reports/analytics (Part 2), settlement reporting, live reconciliation, refunds, production SabPaisa activation.

## Installation

```bash
npm install
cp .env.example .env.local
```

Configure Neon PostgreSQL and Auth in `.env.local`:

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="your-secret-here"
SEED_DEFAULT_PASSWORD="DevPass@123"
```

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

## Database Commands

```bash
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations (development)
npx prisma migrate deploy  # Apply migrations (production/CI)
npm run db:seed        # Seed fictional development data
npm run db:studio      # Open Prisma Studio
```

## Development Login

After seeding, use these credentials (default password from `SEED_DEFAULT_PASSWORD`, default: `DevPass@123`):

| Role | Email |
|------|-------|
| Super Admin | `admin@mahacred.in` |
| Client A Admin (Sahyadri) | `rajesh@sahyadrinagari.coop` |
| Client A Operator | `sneha@sahyadrinagari.coop` |
| Client B Admin (Demo Coop Bank) | `priya@democoopbank.in` |
| Merchant User (Shree Electronics) | `amit@shreeelectronics.example.com` |
| Inactive (login rejected) | `inactive@mahacred.in` |

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Routes

| Route | Access |
|-------|--------|
| `/login` | Public |
| `/dashboard` | Authenticated (role-scoped KPIs) |
| `/clients` | Super Admin list; client roles redirect to own client |
| `/clients/[id]` | Tenant-scoped |
| `/merchants` | Client roles + Super Admin (Merchant User → own merchant) |
| `/merchants/new`, `/merchants/[id]/edit` | Authorized create/edit roles |
| `/merchants/[id]` | Tenant-scoped |
| `/qr-codes` | Tenant-scoped |
| `/transactions` | Tenant-scoped |
| `/reports` | Client roles + Super Admin |
| `/users`, `/users/new` | Super Admin + Client Admin |
| `/settings` | Super Admin + Client Admin |

## Security Architecture

```text
Browser → Next.js Middleware (auth check)
       → Server Components / Actions (RBAC + tenant filter)
       → Neon PostgreSQL (Prisma)
```

- Passwords hashed with bcrypt (cost 12)
- `passwordHash` never sent to client components
- Session contains only: `userId`, `role`, `clientId`, `merchantId`
- Never trust browser-submitted `clientId` or `merchantId` for authorization

## Phase 3 Test Results

Run the full verification suite:

```bash
npm run test:phase3-integration   # Data integrity, audit safety, nav RBAC
npm run test:tenant-isolation     # 6/6 tenant isolation scenarios
npm run test:merchant-security    # 13/13 merchant RBAC scenarios
npm run test:merchant-validation  # Merchant Zod validation
npm run test:user-security        # 16/16 user/RBAC scenarios
npm run test:user-validation      # User input validation
npm run test:sabpaisa-foundation  # SabPaisa Phase 4 Part 1 foundation
npm run test:qr-provider-contract # SabPaisa Phase 4 Part 2 mock contract
npm run test:qr-mock-security     # SabPaisa Phase 4 Part 2 security
npm run test:qr-management        # SabPaisa Phase 4 Part 3 management
npm run test:phase4-e2e-mock      # Phase 4 end-to-end mock workflow
npm run test:phase4-final         # Phase 4 live-readiness + final verification
npm run test:transaction-provider-contract # Phase 5 Part 1 SabPaisa transaction contract
npm run test:phase5-part1         # Phase 5 Part 1 transaction foundation + security
npm run test:phase5-part2         # Phase 5 Part 2 payment event security
npm run test:phase5-part3         # Phase 5 Part 3 transaction management
npm run test:phase5-final         # Phase 5 end-to-end MOCK integration + security
npm run test:phase6-part1         # Phase 6 Part 1 dashboard metrics + security
npx tsc --noEmit                  # TypeScript
npm run lint                      # ESLint
npm run build                     # Production build
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test:phase3-integration
npm run test:tenant-isolation
npm run test:merchant-security
npm run test:merchant-validation
npm run test:user-security
npm run test:user-validation
npm run test:sabpaisa-foundation
npm run test:qr-provider-contract
npm run test:qr-mock-security
npm run test:qr-management
npm run test:phase4-e2e-mock
npm run test:phase4-final
```

## Project Structure

```text
prisma/
  schema.prisma          # Database models
  seed.ts                # Development seed data
src/
  auth.ts                # Auth.js configuration
  middleware.ts          # Route protection + security headers
  app/                   # Next.js App Router pages
  lib/
    db/prisma.ts         # Prisma client singleton
    auth/                # Password, authorization, types
    audit/               # Audit logging
    services/            # Database access with tenant scoping
    actions/             # Server actions (clients, merchants, users)
    validations/         # Zod schemas
    sabpaisa/            # SabPaisa server-only integration foundation
    mappers.ts           # Prisma → UI type mappers
  components/            # UI components
scripts/
  verify-phase3-integration.ts
  verify-tenant-isolation.ts
  verify-merchant-security.ts
  verify-merchant-validation.ts
  verify-user-security.ts
  verify-user-validation.ts
  verify-sabpaisa-foundation.ts
  verify-qr-provider-contract.ts
  verify-qr-mock-security.ts
  verify-qr-management.ts
  verify-phase4-e2e-mock.ts
  verify-phase4-final.ts
  verify-transaction-provider-contract.ts
  verify-phase5-part1.ts
  verify-phase5-part2.ts
  verify-phase5-part3.ts
  verify-phase5-final.ts
  verify-phase6-part1.ts
docs/
  SABPAISA_LIVE_READINESS.md
  PHASE5_STATUS.md

## Remaining Limitations (Post Phase 3)

- **User edit** — create + activate/deactivate only; no name/email/role edit workflow
- **Password reset** — temporary password at creation only; no self-service reset
- **QR generation** — Part 2 mock workflow active; mock QRs are NOT payable; live SabPaisa requires onboarding
- **Reports CSV export** — transactions CSV export is live via `/api/transactions/export`; reports page summary export remains mock
- **Settings persistence** — general/notification settings not stored in database
- **SabPaisa live QR** — mock mode only; see `docs/SABPAISA_LIVE_READINESS.md`; crypto interop BLOCKED
- **Transactions** — Phase 5 MOCK/LEGACY foundation with tenant-safe management; not live payment sync
- **Webhook / settlement / reconciliation** — internal MOCK event processor only; real SabPaisa webhook BLOCKED

## Future Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | UI + Frontend Architecture | Complete |
| **Phase 2** | PostgreSQL + Prisma + Auth + RBAC + Tenant Isolation | Complete |
| **Phase 3** | Bank/Patsanstha + Merchant Onboarding + User Management | Complete |
| **Phase 4** | SabPaisa TEST/MOCK integration + live-readiness | Complete |
| **Phase 5** | TEST/MOCK transaction + event + management integration | Complete |
| **Phase 6 Part 1** | Tenant-scoped Neon dashboard metrics | Complete |
| **Phase 6 Part 2+** | Advanced reports, UAT, production deployment | Not started |
