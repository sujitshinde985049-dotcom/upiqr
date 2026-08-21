# SabPaisa Live Readiness Checklist

MahaCred QR Phase 4 is complete in **TEST/MOCK mode only**.  
Live SabPaisa production integration is **NOT enabled**.

Use this checklist before setting `SABPAISA_MODE=live` in any environment.

---

## Required from SabPaisa

Obtain from SabPaisa onboarding / account manager (never commit values to Git):

| Item | Purpose |
|------|---------|
| Production or UAT base URL | HTTPS API host for SabQR v2.1 |
| API Key | Server-side authentication (`X-API-Key`) |
| API Secret | Server-side authentication (`X-API-Secret`) |
| Required OAuth/API scopes | At minimum: `qr.create`, `qr.read`, `qr.update`, `qr.delete` |
| Merchant / onboarding identifiers | As required by enabled payment rails |
| Enabled payment rails | Documented values: `hdfc`, `icici` |
| Official Node.js/JavaScript encryption helper **or** complete interoperable crypto specification | Required for encrypted request/response envelopes |

### Crypto specification must define (currently BLOCKED)

- PBKDF2 input material (master key encoding and any additional inputs)
- PBKDF2 salt source relative to payload salt field
- PBKDF2 digest algorithm and derived key length/split for AES-256-GCM
- HMAC-SHA384 key material (direct secret vs derived key)
- Exact HMAC byte coverage (which bytes of salt+iv+authTag+ciphertext are authenticated)

Until these are verified, MahaCred **must remain in mock mode**.

---

## Required verification before LIVE

All items must PASS in a SabPaisa UAT/staging environment:

- [ ] Encryption interoperability PASS (encrypt/decrypt/tamper — currently **3 tests BLOCKED**)
- [ ] Authentication test PASS
- [ ] Test/UAT QR create PASS (`POST /api/v2/qr`, scope `qr.create`)
- [ ] QR list/details PASS (`GET /api/v2/qr`, `GET /api/v2/qr/:qr_id`, scope `qr.read`)
- [ ] QR update PASS (`PUT /api/v2/qr/:qr_id`, scope `qr.update`)
- [ ] QR deactivate/reactivate PASS (`DELETE`, `POST .../activate`)
- [ ] QR download PASS (`GET .../download`, PNG/SVG; PDF remains unsupported per docs)
- [ ] Documented error mapping PASS
- [ ] Tenant/RBAC regression PASS (all existing MahaCred security suites)
- [ ] MOCK records excluded from live financial reporting queries

---

## Production activation policy

1. Complete SabPaisa merchant onboarding and receive credentials.
2. Obtain and verify official encryption interoperability (no guessed crypto).
3. Implement/activate `LiveSabPaisaQRProvider` inside `src/lib/sabpaisa/providers/` only.
4. Run full regression + live UAT checklist above.
5. Set `SABPAISA_MODE=live` only in the target server environment after all checks PASS.
6. **Never** silently fall back to mock when live mode is selected.

---

## MahaCred architecture note

Live activation should require changes primarily in:

```text
src/lib/sabpaisa/providers/live-provider.ts
src/lib/sabpaisa/client.ts
src/lib/sabpaisa/encryption.ts   (after official interop spec)
src/lib/sabpaisa/mode.ts
```

Application layers that should **not** need rewrites for live:

- Bank/Patsanstha (Client) onboarding UI and services
- Merchant onboarding UI and services
- QR UI (list, detail, edit, download, deactivate/reactivate)
- `qr-service.ts` tenant/RBAC/business rules
- Prisma QR persistence model

---

## MOCK vs LIVE data policy

- All Phase 4 generated QRs use `providerMode=MOCK` and `isPayable=false`.
- Mock downloads encode `MAHACRED_TEST_QR:<localId>` — **not** payable UPI destinations.
- Future transaction/report queries **must filter out** `providerMode=MOCK` from live financial reporting unless explicitly viewing test data.
- Deactivating a Client or Merchant does **not** hard-delete existing QR/history records; this is intentional for audit preservation.

---

## Required from SabPaisa before real webhook activation

Official payment webhook/callback documentation is **NOT** included in SabQR API Documentation v2.1 (which covers transaction read APIs only). Before enabling any live webhook endpoint, obtain:

| Item | Purpose |
|------|---------|
| Official payment webhook/callback documentation | Exact callback URL expectations and payload schema |
| Event identifiers | Stable event ID / delivery semantics |
| Signature/authentication header names | Verified request authenticity |
| Signing algorithm and secret/key handling | No guessed HMAC/header schemes |
| Timestamp/replay specification | Provider-level replay protection |
| Retry policy | Safe idempotent re-delivery behavior |
| Acknowledgement requirements | Expected HTTP response semantics |
| Test/UAT webhook facility | Staging verification before production |

MahaCred status: **BLOCKED — official SabPaisa webhook specification required**

---

## Not in scope for live QR activation

- Transaction API live reads (`GET /api/v2/transactions`, `GET /api/v2/qr/:qr_id/transactions`) — mock/local only in Phase 5 Part 1
- Live payment webhook adapter — **BLOCKED** (see webhook checklist above; internal MOCK processor exists in Phase 5 Part 2)
- QR analytics API
- Webhooks / settlement / reconciliation (real SabPaisa webhook still BLOCKED)
- Bulk QR
- QR regenerate (`POST /api/v2/qr/:qr_id/regenerate` — documented as not yet implemented by SabPaisa)

These belong to subsequent MahaCred phases.
