# Coachify deployment and demo guide

**GitHub:** Not published yet  
**Live frontend:** Not deployed  
**Live backend:** Not deployed

## Local install and run

Prerequisites: Node.js, npm, and MongoDB. Use a MongoDB replica set for transaction-backed payments, refunds, and unmatched matching.

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Edit .env locally; never commit it.
npm run seed:demo
npm run dev
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Set `VITE_API_BASE_URL` only when the frontend should call a specific API origin. For same-origin production hosting, omit it and have the frontend host/reverse proxy route `/api` to the backend.

## Demo database and synthetic seed

Use a separately provisioned MongoDB Atlas database named with a `demo`, `dev`, or `test` marker (for example `coachify_demo`). Configure its URI only in local/private environment settings. Verify the selected Atlas database and network access before seeding. Never point the demo seeder at production data: it is guarded by `NODE_ENV=development`, `DEMO_SEED_ENABLED=true`, and the database-name check.

Set private `DEMO_ACCOUNTS_PASSWORD`, `DEMO_COUNSELLOR_PASSWORD`, and `DEMO_PARENT_PASSWORD` values before running the seed. The seed uses synthetic accounts and repeatable upserts. Seeded Accounts and Counsellor emails use the `@coachify.test` domain. Parent demo phones are synthetic; the allowlist is configured through `DEMO_PARENT_PHONES`.

For demo-only parent login set `DEMO_OTP_ENABLED=true` in development. OTP is returned to the demo login flow for eligible synthetic accounts and is not logged. Do not enable this mechanism in production. Accounts/Counsellor passwords are the private values supplied to the seed. No shared password is published here.

## Production environment variable names

Configure these through the hosting provider's secret/environment settings. This document intentionally contains names only, never values.

- `NODE_ENV`
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `MOCK_GATEWAY_SECRET` (development demo only; do not configure as a real gateway credential)
- `INSTITUTE_NAME`
- `INSTITUTE_ADDRESS`
- `INSTITUTE_GST_TAXABILITY`
- `INSTITUTE_GST_RATE_BPS`
- `INSTITUTE_GST_TREATMENT`
- `DEMO_SEED_ENABLED` (development only)
- `DEMO_OTP_ENABLED` (development only)
- `DEMO_PARENT_PHONES` (synthetic demo allowlist only)
- `DEMO_ACCOUNTS_PASSWORD` (seeding only)
- `DEMO_PARENT_PASSWORD` (seeding only)
- `DEMO_COUNSELLOR_PASSWORD` (seeding only)
- `VITE_API_BASE_URL` (frontend build-time setting, only when not using same-origin `/api`)

Production startup requires a strong JWT secret, valid MongoDB URI and port, exact HTTPS `CORS_ORIGINS`, and valid paired institute/tax configuration when GST is taxable. Do not enable demo seed/OTP in production. A real OTP, payment, refund, and messaging provider is required before enabling those production workflows; mock services are intentionally unavailable there.

## Vercel frontend

1. Import the repository into Vercel after it is pushed to a private/authorized GitHub repository.
2. Set the project root to `frontend`.
3. Build command: `npm run build`. Output directory: `dist`.
4. Configure `VITE_API_BASE_URL` with the backend `/api` URL if using separate origins, or configure a Vercel rewrite to the backend and leave it unset for same-origin `/api`.
5. Configure a React Router SPA fallback to `index.html` if direct nested-route navigation is not handled automatically.
6. Add the exact frontend HTTPS origin to backend `CORS_ORIGINS` when calling a separate backend origin.

## Node.js backend host and MongoDB Atlas

1. Create a Node.js service using `backend` as the root and `npm ci` as the install command.
2. Start command: `node server.js` (or the host's Node start command). Health check path: `/health`.
3. Set runtime variables via host secrets, including an Atlas URI for the intended production database, strong JWT secret, `NODE_ENV=production`, `PORT` as supplied by the host, and exact frontend origins in `CORS_ORIGINS`.
4. Configure Atlas network access for the backend host's outbound network and database user privileges. Keep credentials only in the host's secret manager.
5. Deploy and verify `/health` returns HTTP 200 only after the application connects to MongoDB. Confirm logs contain no credentials or personal data.
6. Do not run the synthetic demo seeder against production. Use a separately provisioned demo database and private development environment.

## Demo behavior and limitations

- Parent demo OTP is a development-only code available to the three synthetic, allowlisted parent accounts; it is not delivered by SMS.
- Mock payment outcomes do not charge a card or transfer money. Mock refund processing does not transfer money. Mock reminders do not send SMS/WhatsApp.
- Production blocks mock payment/refund processing and OTP; production reminders remain disabled pending a provider.
- GST receipt details must be confirmed and configured before issuing real institute receipts.
- The repository has not been deployed. Hosting authentication, Atlas credentials, provider integrations, and reviewer passwords remain manual setup steps.

## Build/test commands

```powershell
cd backend
npm test
cd ..\frontend
npm run build
```

`/health` is the readiness endpoint. A successful unit suite or local build does not establish live Atlas, hosting, or browser E2E verification.
