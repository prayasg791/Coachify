# Coachify

**GitHub:** Not published yet  
**Live application:** Not deployed

Coachify is a MERN fee-management and student-support portal for an institute. It provides separate Parent, Accounts, and Counsellor workflows for fee visibility, payments, refunds, attendance, tests, reminders, receipts, reporting, and dropout-risk follow-up.

## Features

- Parent access to consented linked students, fee ledgers, payment history, receipts, refunds, academic records, and reminder history.
- Accounts workflows for centre-scoped dashboards, student and ledger lookup, offline payments, refund queue, unmatched payment review, attendance, test scores, reminder history, receipts, and financial/Tally CSV reports.
- Counsellor workflows for assigned risk tasks, review, follow-up, and resolution.
- Integer-paise fee calculations, successful-payment ledger aggregation, payment/refund audit records, and transaction-backed processing where supported by MongoDB replica sets.
- Synthetic, idempotent demo seed and explicitly labelled mock payment/refund/messaging flows.

## Stack and architecture

- Frontend: React 18, React Router, Axios, Vite, Tailwind CSS.
- Backend: Node.js ES modules, Express, Mongoose, MongoDB, JWT bearer authentication.
- The frontend calls `/api` in a same-origin production deployment, or `VITE_API_BASE_URL` when configured. The Express API uses role authorization, parent ownership/consent checks, and assigned-centre checks.
- Main source folders: `frontend/src` (views, contexts, API clients, components) and `backend/src` (routes, controllers, services, models, middleware, seed, jobs).

## Local setup

1. Install Node.js supported by the installed Vite/Mongoose versions and MongoDB Community configured as a replica set for transaction workflows.
2. Install dependencies with `npm ci` in `backend` and `frontend`.
3. Copy `backend/.env.example` to a local `backend/.env`; use a database named `coachify_demo`, a generated JWT secret of at least 32 bytes, and development-only mock secrets. Never commit `.env`.
4. Seed synthetic demo data only after confirming the URI targets the dedicated demo database. Set `DEMO_SEED_ENABLED=true`, provide three locally chosen demo passwords, and run `npm run seed:demo` from `backend`. The seed refuses production mode and database names without a dev/demo/test marker.
5. For parent demo OTP, set `DEMO_OTP_ENABLED=true` and retain only the synthetic phone allowlist in `DEMO_PARENT_PHONES`. Run the app with `NODE_ENV=development`. The OTP appears in the development login response/page; it is never written to logs. This is not an OTP delivery service.
6. Start the API using `npm run dev` in `backend`. Start the frontend with `npm run dev` in `frontend`; its local default API is `http://localhost:5000/api`.

Demo identities are seeded with synthetic `@coachify.test` / `@example.test` addresses. Accounts and Counsellor use their email and the locally configured seed password. Parent uses one of the documented synthetic phone numbers in `backend/.env.example` and the development OTP flow. No reusable password is published in this repository; configure private reviewer credentials locally.

## Build and verification

- Backend tests: `npm test` in `backend`.
- Frontend production build: `npm run build` in `frontend`.
- Live MongoDB and browser tests must be performed against an explicitly prepared demo environment; a mocked test or build is not a live integration test.

## Documentation

- [Technical Design Document](TDD.md)
- [Deployment guide](deployment.md)
- [Tally CSV mapping](docs/tally-csv-mapping.md)
- [Financial reports and receipts](backend/docs/financial-reports-and-receipts.md)
- [Risk management API](backend/docs/risk-management-api.md)

## Demo and deployment limitations

Mock payment/refund outcomes do not move real money. Mock reminder delivery records a simulated result only. Production mode blocks mock payment/refund and parent OTP paths, and the reminder scheduler is disabled until a real delivery integration is configured. GST behavior remains unconfigured until institute taxability and required details are supplied. No live URLs are available yet.
