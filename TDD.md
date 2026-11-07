# Coachify — Technical Design Document

**GitHub:** Not published yet  
**Live URL:** Not deployed

## 1. Problem statement

Institutes need a controlled way to manage fee plans, instalments, payments, refunds, receipts, academic records, reminders, financial reports, and student-risk follow-up. Parents should see only their own linked students and only while data consent is active. Accounts staff must remain scoped to assigned centres. Counsellors should handle only risk tasks assigned to them.

## 2. Requirements and scope

The application provides role-specific workflows for `PARENT`, `ACCOUNTS`, and `COUNSELLOR`. Money is represented in integer paise. A fee ledger counts only `SUCCESS` payments. Parent reads of student data require ownership and consent; Accounts reads and writes are centre-scoped; Counsellor task actions are assignment-scoped. Mock integrations are for demonstration and are not production financial or messaging services.

## 3. Architecture

```text
React / Vite SPA
    │ Axios JSON requests with Bearer JWT
    ▼
Express API ── authentication / role / ownership / consent / centre middleware
    │
    ├── controllers → domain services → Mongoose models
    ├── reminder scheduler and mock delivery (development only)
    └── MongoDB (replica set required for transaction-backed operations)
```

The frontend uses the same-origin `/api` base in production by default, or `VITE_API_BASE_URL`. Production API startup validates MongoDB URI, JWT secret length, port, CORS allowlist, and configured tax details. `/health` reports database readiness. Shutdown stops the reminder job and closes HTTP/MongoDB connections.

## 4. Data model

| Model | Main responsibility and relationships |
|---|---|
| User | Authentication identity, role, password hash, active status, and centre assignments for staff; parent identity links from Student. |
| Centre / Batch | Institute centres and batches; a batch belongs to a centre. |
| Student | Human-readable student ID, name, parent, centre, batch, course dates, status. |
| Consent | Parent/student/purpose consent, state, policy version, verification metadata, and audit history. |
| FeePlan / Instalment | Student fee plan and due instalments in integer paise. |
| Payment | Student/instalment payment, method, transaction reference, amount, status, dates, and recording actor. Only SUCCESS contributes to a ledger. |
| UnmatchedPayment | Accounts review record for an unallocated payment; only a successful match creates a separate ledger payment. |
| Refund | Refund request, calculation snapshot, withdrawal date, decisions, processing state, and audit data. Refunds are reported separately from collections. |
| Receipt / ReceiptCounter | Immutable receipt snapshot and atomic receipt number sequence. |
| Reminder | Reminder type, language, message, due/scheduled/sent timestamps and delivery status. |
| Attendance / TestScore | Dated academic records and recording actor. |
| RiskFlag | Risk-analysis result, centre/student context, assignment and counsellor review lifecycle. |
| AuditLog | Actor, action, entity, and operation details for material workflow changes. |

Schema-level unique indexes and query indexes are defined with their models. Transaction workflows require MongoDB replica-set support and should be verified on the target Atlas cluster before use.

## 5. API contracts

All protected routes use `Authorization: Bearer <JWT>`. JSON responses use `{ success, data, message? }` conventions; validation and authorization errors use appropriate HTTP status codes.

| Route | Roles | Purpose |
|---|---|---|
| `POST /api/auth/accounts/login` | Public | Accounts email/password login. |
| `POST /api/auth/counsellor/login` | Public | Counsellor email/password login. |
| `POST /api/auth/parent/request-otp`, `POST /api/auth/parent/verify-otp` | Public | Parent OTP challenge and verification; demo OTP is development-only and allowlisted. |
| `GET /api/parent/students` | Parent | Linked, eligible children derived from JWT identity and active consent. |
| `/api/fees` | Parent, Accounts as route-specific | Fee plans and student ledger; parent access enforces ownership and consent, Accounts access centre scope. |
| `/api/payments` | Parent, Accounts as route-specific | Parent payment initiation/history; Accounts offline and unmatched-payment review/match/reject. `POST /api/payments/mock-process` is development-only. |
| `/api/refunds` | Parent, Accounts as route-specific | Parent refund calculation/request/history and Accounts queue/decision/processing. Accounts queue filters include status, centre, search, page, and limit. |
| `GET /api/reminders/parent` | Parent | Reminder history for consented linked children. |
| `GET /api/reminders/accounts` | Accounts | Centre-scoped reminder history with validated filters and pagination. |
| `/api/attendance`, `/api/tests` | Parent reads, Accounts writes as route-specific | Academic records; parent reads require ownership and consent. |
| `/api/receipts` | Parent, Accounts | Receipt access with ownership/consent or centre authorization. |
| `/api/reports/accounts` | Accounts | Financial reports, receipt configuration, and Tally CSV export. |
| `/api/risk` | Accounts, Counsellor as route-specific | Centre-scoped assignment and assigned-counsellor task lifecycle. |
| `GET /health` | Public health check | `200 {status:"ok"}` when MongoDB is ready; otherwise `503 {status:"not_ready"}`. |

See route files in `backend/src/routes` and the focused API notes in `backend/docs` for exact request schemas and filter values.

## 6. Security and authorization

- JWT subject supplies the identity; clients do not choose a parent identity for parent operations.
- Passwords are stored as hashes. Auth middleware verifies token and role.
- Parent reads/writes check student ownership and active consent as required; consent grant requires a recent signed OTP verification claim.
- Accounts queries are constrained to assigned centres. Explicit unauthorized centre filters are rejected.
- Counsellor task operations require the logged-in counsellor to be the assigned counsellor.
- Request JSON has a 1 MB limit. Production CORS requires exact HTTPS origin allowlisting. Sensitive values are excluded from routine logs.
- Demo seeding requires development mode, explicit seed opt-in, and a database name containing a development/demo/test marker. Demo OTP requires development mode, explicit opt-in, a synthetic account, and an allowlisted phone.

## 7. Payment and refund workflows

Parent mock gateway payment initiation creates a pending payment, then the development-only mock callback signs and confirms a SUCCESS/FAILED result. Only SUCCESS affects the ledger. Production online gateway processing is unavailable and returns a service error rather than creating a simulated transaction. Accounts offline payments use validation, centre authorization, duplicate-reference protection, a transaction, and audit logging.

Unmatched payment records remain outside the ledger until Accounts validates the student and instalment, confirms centre access, and matches the record through the payment workflow. Rejected/unmatched records never count toward fees. Matching protects duplicate references, overpayment, and concurrent processing with database transaction/conditional update patterns.

Refund amounts follow the existing pro-rata policy implementation; requests move through explicit review and processing states. Development mock processing is clearly labelled and is disabled in production. Refunds do not rewrite payment history or collection totals.

## 8. AI dropout-risk workflow

Academic record changes trigger a risk analysis service that evaluates student attendance/performance signals and maintains risk flags. Accounts can list and assign tasks to active counsellors in authorized centres. Counsellors can see and act on only assigned tasks, record review outcomes/notes, identify false positives, and resolve after follow-up. Risk analysis failure does not roll back a saved academic record.

## 9. Assumptions and limitations

- Institute taxability, GST treatment/rate, and institute identity must be confirmed before production receipts are configured.
- OTP delivery, payment gateway, refund processor, and messaging provider are not integrated. Production blocks these mock paths.
- Demo identities and seeded academic/fee records are synthetic. Demo seed reruns use deterministic/upsert keys; it must target a dedicated demo database.
- MongoDB transactions need a replica set. No live Atlas verification is implied by unit tests.
- Tally export is a CSV mapping aid, not a native Tally integration.
- This repository has no deployed frontend/backend URL or published GitHub repository at document creation.

## 10. Testing strategy

Backend uses Node's built-in test runner with HTTP integration tests and model/service mocks for authorization, business logic, filters, pagination, and negative cases. Run `npm test` in `backend`. Frontend is validated with `npm run build` in `frontend`. Live MongoDB replica-set, hosted deployment, and browser E2E tests are separate checks and must be recorded only when executed.
