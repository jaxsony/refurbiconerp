# Refurbicon ERP

Multi-tenant SaaS ERP for Sales, Service, Accounts, People and Dispatch. This repository implements **Phases 1–6** from the baseline SRS (v1.0, 14 September 2026).

Stack: NestJS, React + TypeScript, PostgreSQL, Prisma, Redis, BullMQ.

## What this cut covers

| Requirement | Status |
| --- | --- |
| TEN-001 to TEN-008 tenant isolation | Implemented |
| ADM-001 to ADM-006 platform administration | Implemented |
| TSK-001 to TSK-008 tasks and workflow | Implemented |
| SAL-001 to SAL-010 CRM and quote-to-cash | Implemented |
| INV-001 to INV-008 products, stock and purchasing | Implemented |
| ACC-001 to ACC-010 ledgers, invoices and receipts | Implemented |
| HR-001 to HR-010 / INC-* people, payroll, incentives | Implemented |
| RMA-* / DSP-* service centre and dispatch | Implemented |
| REC-* / BNK-* / WAP-* / MKT-* automation | Implemented |
| RPT / MIG / MOB / GOL transition and go-live | Implemented |

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (local service or Docker)
- Redis 7 recommended (notifications fall back to the database if the queue cannot start)

If `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, your network is intercepting TLS. Retry for that session only:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
npm install --strict-ssl=false
```

## Run locally

```bash
copy .env.example apps\api\.env
copy .env.example .env
npm install
npm run db:setup
npm run dev:api
npm run dev:web
```

Use `postgresql://postgres:postgres@localhost:5432/refurbiconerp?schema=public` (or `127.0.0.1` if `localhost` fails IPv6). After pulling schema changes, re-run `npm run db:setup` and sign in again so new role permissions are on the JWT.

- API: http://localhost:3001/api/v1
- OpenAPI: http://localhost:3001/docs (also `/api/v1/docs`)
- Web: http://localhost:5173

Walkthroughs:

- Quote to cash: `/quote-to-cash`
- HR / payroll: `/people-ops`
- Service centre: `/service`
- Dispatch: `/dispatch`
- Recurring / bank / WhatsApp: `/automation`
- Field: `/field`
- Go-live checklist: `/go-live`

### Seeded accounts

| Role | Email | Password |
| --- | --- | --- |
| Platform administrator | `admin@refurbicon.local` | `ChangeMe!Admin1` |
| Tenant owner (Acme) | `owner@acme.demo` | `ChangeMe!Owner1` |
| Sales user (Acme) | `sales@acme.demo` | `ChangeMe!Sales1` |
| Tenant owner (Globex) | `owner@globex.demo` | `ChangeMe!Owner1` |

Acme includes customer `Northwind Traders`, SKU `REFURB-PHONE`, spare `SCREEN-ASM`, service `DIAG-FEE`, employee `EMP-0001` (linked to the owner), leave policy `CL`, AMC schedule, bank account and WhatsApp channel. Acme and Globex remain isolated tenants (TEN-008).

## Delivery map

1. Foundation — tenancy, identity, RBAC, audit
2. Operations — quote-to-cash
3. People — HR, attendance, payroll, incentives
4. Service — RMA, dispatch, couriers
5. Automation — recurring, banking, WhatsApp, marketplaces
6. Transition — reports, mobile/field APIs, migration, go-live

Requirement IDs from `docs/REQUIREMENTS.md` must appear on tickets, APIs, migrations and tests.

## Deploy on Vercel + Supabase (free)

Supabase is Postgres. Vercel hosts the Vite app and the NestJS API as one project (same origin, so `VITE_API_URL` can stay `/api/v1`). Do not set `REDIS_URL` on Vercel — in-app notifications write to the database instead. BullMQ workers cannot run on serverless.

### 1. Supabase database

1. Create a project at [supabase.com](https://supabase.com/).
2. Open **Project Settings → Database → Connection string → URI**.
3. Copy two URLs:
   - **Direct** (host `db.<project-ref>.supabase.co`, port `5432`) → `DIRECT_URL`
   - **Transaction pooler** (host `*.pooler.supabase.com`, port `6543`) → `DATABASE_URL`
4. Append query params:

```text
DIRECT_URL=postgresql://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
```

5. From this repo, put those values in `apps/api/.env` (temporarily, replacing the local Docker URL) and run:

```bash
npm run db:setup
```

That creates tables and the seeded logins. Switch `apps/api/.env` back to local Docker when you develop on your machine.

### 2. Vercel project

1. Push the repo to GitHub.
2. Import it in [vercel.com](https://vercel.com/) (root directory = repository root, not `apps/web`).
3. Framework preset: **Other**. `vercel.json` already sets install, build, and output.
4. Add environment variables (Production + Preview):

```text
NODE_ENV=production
API_PREFIX=api/v1
WEB_ORIGIN=https://YOUR-PROJECT.vercel.app
DATABASE_URL=<transaction pooler URL from step 1>
DIRECT_URL=<direct URL from step 1>
JWT_ACCESS_SECRET=<long random hex>
JWT_REFRESH_SECRET=<different long random hex>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
PLATFORM_ADMIN_EMAIL=admin@refurbicon.local
PLATFORM_ADMIN_PASSWORD=<change the seed password>
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Leave `REDIS_URL` unset. After the first deploy, set `WEB_ORIGIN` to the exact `https://….vercel.app` URL (or your custom domain) and redeploy.

5. Deploy. App: `https://YOUR-PROJECT.vercel.app`. API: `https://YOUR-PROJECT.vercel.app/api/v1`. OpenAPI: `https://YOUR-PROJECT.vercel.app/api/v1/docs`.

Cold start on the free plan can take several seconds. Recurring schedules still run only when something calls `POST /recurring-schedules/run` — there is no always-on worker on Vercel.
