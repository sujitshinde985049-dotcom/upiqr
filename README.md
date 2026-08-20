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
UPI Transactions (seeded demo data in Phase 3)
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

### QR & SabPaisa (Phase 4 Placeholder)

- **Generate QR** buttons display a Phase 4 placeholder — no SabPaisa API calls
- Existing seeded QR records are identifiable as development/demo data
- SabPaisa credentials, encryption, webhooks, and live payment sync: **Phase 4**

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
    mappers.ts           # Prisma → UI type mappers
  components/            # UI components
scripts/
  verify-phase3-integration.ts
  verify-tenant-isolation.ts
  verify-merchant-security.ts
  verify-merchant-validation.ts
  verify-user-security.ts
  verify-user-validation.ts
```

## Remaining Limitations (Post Phase 3)

- **User edit** — create + activate/deactivate only; no name/email/role edit workflow
- **Password reset** — temporary password at creation only; no self-service reset
- **QR generation** — Phase 4 placeholder; existing QR records are demo/seed data
- **Reports CSV export** — mock implementation
- **Settings persistence** — general/notification settings not stored in database
- **SabPaisa integration** — Phase 4 (authentication, encryption, live QR APIs, webhooks)
- **Transactions** — seeded development data; not live payment sync

## Future Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | UI + Frontend Architecture | Complete |
| **Phase 2** | PostgreSQL + Prisma + Auth + RBAC + Tenant Isolation | Complete |
| **Phase 3** | Bank/Patsanstha + Merchant Onboarding + User Management | Complete |
| **Phase 4** | SabPaisa Authentication + Encryption + QR APIs | Not started |
| **Phase 5** | Transactions + Payment Sync + Reports | Not started |
| **Phase 6** | Testing + Security + UAT + Production Deployment | Not started |
