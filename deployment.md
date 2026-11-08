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

Use a separately provisioned MongoDB Atlas database named with a `demo`, `dev`, or `test` marker (for example `coachify_demo`). Configure its URI only in local/private environment settings. Verify the selected Atlas database and network access before seeding. Never point the demo seeder at production data: it is guarded by `NODE_ENV=development`, `DEMO_SEED_ENABLED=true`, `DEMO_OTP_ENABLED=true`, and the database-name check.

Set private `DEMO_ACCOUNTS_PASSWORD`, `DEMO_COUNSELLOR_PASSWORD`, and `DEMO_PARENT_PASSWORD` values before running the seed. The seed uses synthetic accounts and repeatable upserts. Seeded Accounts and Counsellor emails use the `@coachify.test` domain. There are four Accounts Executive identifiers: `accounts.demo@coachify.test`, `accounts.jpr-nth.demo@coachify.test`, `accounts.jpr-sth.demo@coachify.test`, and `accounts.jpr-wst.demo@coachify.test`; each sees only its centre. The Counsellor identifier is `counsellor.demo@coachify.test`. The original three parent identifiers remain, and the other parent emails follow `parent.demo.NNNN@example.test` (sequence 0004–0120). Parent OTP login uses the corresponding synthetic account from `DEMO_PARENT_PHONES` in the example configuration; values are not repeated here.

Seeded parent consent is marked `DEMO_SEED` and is synthetic only, not legally valid consent. It is accepted for portal testing in development. Production consent lookups explicitly exclude demo consent; real parents must grant consent through the OTP-authenticated consent flow.

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

## Vercel single-project deployment

The repository root `vercel.json` defines two Vercel Services: `frontend` (Vite) and `backend` (Express). The `/health` and `/api/(.*)` rewrites route to Express, preserving every existing API route; `/health` remains an explicit readiness endpoint. The final catch-all sends page requests to the Vite service, including client-side routes.

1. Import the repository root as one Vercel project. In Project Settings → Build and Deployment, select **Services** as the framework/preset; keep the project root at the repository root so Vercel reads `vercel.json`.
2. Vercel detects each service's build independently. Vite runs `npm run build` and serves `dist`. Express is deployed as a function from `backend/server.js`; it has no separate build command or static output directory. Leave service build/output overrides unset unless Vercel changes its framework defaults.
3. In the frontend service's build environment settings, set `VITE_API_BASE_URL` to `/api` for Preview and Production. This is a same-origin service path, so it works with each deployment's shared domain and does not embed a deployment hostname in the frontend bundle.
4. In the backend service's runtime environment settings, set `NODE_ENV=production`, `MONGO_URI`, a strong `JWT_SECRET`, and `CORS_ORIGINS` to the exact HTTPS origin used by the frontend (for example, the production custom domain origin, without a path or trailing slash). Store values in Vercel's encrypted environment settings, never in Git or `vercel.json`. Add any additional trusted frontend origins as comma-separated exact HTTPS origins. Vercel Preview URLs that need cross-origin access must be explicitly added to Preview `CORS_ORIGINS`; same-origin `/api` calls do not require browser CORS permission.
5. Configure remaining required production values (such as institute receipt settings) in Vercel's backend runtime environment settings. Do not set `MOCK_GATEWAY_SECRET`, `DEMO_SEED_ENABLED=true`, or `DEMO_OTP_ENABLED=true` in Production. The existing production guards continue to reject mock payment/refund processing and demo OTP.
6. Provision MongoDB Atlas for production, set network access and database-user permissions for the backend runtime, and verify the Vercel backend `/health` endpoint after deployment. Keep demo seeding restricted to a separate development database.

The backend opens/reuses its MongoDB connection on API requests so the exported Express app works in Vercel's function runtime; standalone `node server.js` startup remains supported for local development. The public `/health` readiness URL is routed to the backend; the backend root route remains available inside that service.

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
