# Cursor/Windsurf Plan — Manual Billing + Plan Assignments (Option B) + Free→Billable + Audit

## Goal
Stripe’i kaldırarak şu akışı production-ready hale getirmek:
- Admin → Client’a plan atar (history’li, Option B)
- Time tracking → free minutes önce tüketilir, aşanı billable olur (deterministik + concurrency-safe)
- Admin → Client’a invoice atar (OPEN)
- Client → invoice görür, dekont yükler (REVIEW)
- Admin → dekontu onaylar/iptal eder (PAID/CANCELLED)
- Portal → invoice history + bu ay free hours remaining
- Tüm aksiyonlar audit log’a düşer
- Multi-tenant izolasyon (client_id) korunur

---

## Branch / PR
- Branch: `feat/manual-billing-plans`
- PR title: `Manual billing (invoices+proof), client plan assignments, allowance ledger + free→billable`
- Labels: `backend`, `db`, `breaking-change: no` (eski tabloları drop etmiyoruz)

---

## Commit 1 — DB Migration: plans + invoices + allowance ledger + time_entries columns
### Files
- `supabase/migrations/20260210_manual_billing_and_plans.sql`  *(prefix benzersiz olmalı; sizde duplicate prefix hatası vardı)*

### SQL checklist
1) `client_plans`
- columns: id, client_id, plan_code, effective_from, effective_to, assigned_by, created_at, updated_at
- constraints:
  - `check (effective_to is null or effective_to >= effective_from)`
  - `create unique index ... on client_plans(client_id) where effective_to is null;`
- indexes:
  - `(client_id, effective_from desc)`

2) `client_monthly_allowances`
- columns: id, client_id, period_start (date, ayın 1’i), free_minutes_total, free_minutes_used, timestamps
- constraints:
  - unique `(client_id, period_start)`
  - check used<=total
- indexes:
  - `(client_id, period_start desc)`

3) `invoices`
- columns:
  - id, client_id, invoice_no, title, description, currency, amount_total, due_date
  - status (OPEN|REVIEW|PAID|CANCELLED)
  - period_start (nullable)
  - billable_minutes_snapshot (nullable), hourly_rate_snapshot (nullable)
  - invoice_document_id (nullable fk documents.id)
  - proof_document_id (nullable fk documents.id)
  - created_by, reviewed_by, reviewed_at, review_note
  - created_at, updated_at
- constraints:
  - unique `(client_id, invoice_no)`
  - status check (enum via check constraint veya pg enum)
- indexes:
  - `(client_id, status, created_at desc)`
  - `(client_id, period_start desc)`

4) `time_entries` alter
- add:
  - `free_minutes_consumed int not null default 0`
  - `billable_minutes int not null default 0`

5) RPC (concurrency-safe allowance consume + time entry insert) ✅ önerilen
- create function `consume_allowance_and_insert_time_entry(...)`
  - input: client_id, worked_at, duration_minutes, task, advisor_user_id, source, created_by
  - output: inserted time_entry row
  - logic:
    - compute period_start (date_trunc month)
    - find plan for worked_at in client_plans (effective range)
    - plan->free_total mapping (NONE=0, BASIC=240, PRO=540) (hardcode in function initially)
    - upsert/lock allowance row (SELECT ... FOR UPDATE)
    - compute free_consumed / billable
    - update allowance.used
    - insert time_entries with computed fields
    - return inserted row

6) RLS policies
- enable RLS on:
  - client_plans, client_monthly_allowances, invoices (time_entries mevcutsa dokunma minimal)
- policies:
  - client: select where client_id matches
  - admin: full access (role claim / jwt custom claim ile)
  - invoices client update: DB’de kapat (öneri) → backend enforce
    - policy: client update false (veya sadece proof_document_id alanına izin vermek çok kompleks; backend + service role ile daha güvenli)

### Acceptance (Commit 1)
- `supabase db reset` veya migration apply başarıyla geçer
- `client_plans`’ta tek aktif plan unique index çalışır
- RPC function `select consume_allowance...` basit test ile çalışır

---

## Commit 2 — Types: database models + enums
### Files
- `src/types/database.ts`

### Changes
- Add interfaces:
  - `DbClientPlan`
  - `DbClientMonthlyAllowance`
  - `DbInvoice`
- Update existing `DbTimeEntry`:
  - add `free_minutes_consumed`, `billable_minutes`
- Add literal unions / enums:
  - `PlanCode = 'NONE'|'BASIC'|'PRO'`
  - `InvoiceStatus = 'OPEN'|'REVIEW'|'PAID'|'CANCELLED'`

### Acceptance (Commit 2)
- `pnpm test` / `npm test` (repo standard) typecheck passes
- No TS errors in services

---

## Commit 3 — Audit actions expansion
### Files
- `src/constants/auditActions.ts`

### Add actions
- `CLIENT_PLAN_ASSIGNED`, `CLIENT_PLAN_CHANGED`
- `MONTHLY_ALLOWANCE_CREATED`, `MONTHLY_ALLOWANCE_CONSUMED`
- `INVOICE_CREATED`, `INVOICE_UPDATED`
- `INVOICE_PROOF_SUBMITTED`
- `INVOICE_APPROVED`, `INVOICE_CANCELLED`

### Acceptance (Commit 3)
- Audit log writer helper compile OK
- No duplicate keys in actions map

---

## Commit 4 — Client Plans (Option B): service + admin endpoints + client read endpoint
### Files (new)
- `src/modules/clientPlans/clientPlans.service.ts`

### Files (modify)
- `src/modules/admin/admin.routes.ts`
- `src/app.ts` (client-scoped plan read endpoint mount, if separated)
  - alternatif: client plan read endpoint’i billing router içine koy

### Service methods
- `assignPlan(clientId, planCode, effectiveFrom, assignedBy)`
  - close active plan (`effective_to = effectiveFrom - 1 day`)
  - insert new plan row (`effective_to = null`)
  - write audit log with `{ from, to, effective_from }`
- `getCurrentPlan(clientId, asOfDate = today)`
- `listPlanHistory(clientId)`

### Admin routes (inside admin.routes.ts)
- `POST /api/admin/clients/:clientId/plan-assignments`
- `GET /api/admin/clients/:clientId/plan-assignments`
- `GET /api/admin/clients/:clientId/plan`

### Client route (client scoped)
- `GET /api/clients/:clientId/billing/plan`
  - returns current plan + effective_from

### Acceptance (Commit 4)
- Admin can create plan assignment; previous plan closes correctly
- Client can read current plan (validateClientAccess enforced)
- Audit log entry is created

---

## Commit 5 — Time entries: use RPC for allowance consume + free→billable
### Files (modify)
- `src/modules/timeEntries/timeEntries.service.ts`

### Change strategy
- Replace old allowance decrement logic with:
  - `supabase.rpc('consume_allowance_and_insert_time_entry', params)`
- Ensure response maps to existing API response shape (Bubble expects certain fields)
- Write audit log:
  - at least `TIME_ENTRY_CREATED` style action + metadata `{ duration, free, billable, worked_at }`
  - (optional) if RPC created allowance row, log `MONTHLY_ALLOWANCE_CREATED` in RPC via trigger OR do best-effort in backend by checking `allowance existed` before RPC (extra query). MVP: log only time entry.

### Acceptance (Commit 5)
- Create time entry:
  - allowance created for new month
  - free minutes consumed before billable
- Parallel inserts (quick test): two calls do not overspend allowance

---

## Commit 6 — Invoices: routes + service (manual billing + proof + admin decision)
### Files (new)
- `src/modules/invoices/invoices.routes.ts`
- `src/modules/invoices/invoices.service.ts`

### Files (modify)
- `src/app.ts` (mount client invoice routes)
- `src/modules/admin/admin.routes.ts` (admin invoice endpoints)

### Client-scoped routes
- `GET /api/clients/:clientId/invoices`
- `GET /api/clients/:clientId/invoices/:invoiceId`
- `POST /api/clients/:clientId/invoices/:invoiceId/proof`
  - body `{ document_id }`
  - enforce:
    - invoice belongs to clientId
    - status must be OPEN
    - set `proof_document_id`, status->REVIEW
  - audit: `INVOICE_PROOF_SUBMITTED`

### Admin routes (admin.routes.ts)
- `POST /api/admin/clients/:clientId/invoices`
  - create invoice status OPEN
  - audit: `INVOICE_CREATED`
- `GET /api/admin/invoices` (filters: clientId,status,date range)
- `GET /api/admin/invoices/:invoiceId`
- `POST /api/admin/invoices/:invoiceId/decision`
  - decision approve/cancel
  - require status REVIEW
  - set reviewed fields
  - audit: `INVOICE_APPROVED` / `INVOICE_CANCELLED`

### Acceptance (Commit 6)
- Admin creates invoice → client lists it
- Client submits proof → status REVIEW
- Admin decides → status PAID/CANCELLED
- Signed download still works via existing documents endpoint

---

## Commit 7 — Billing summary endpoints (plan + allowance remaining) for portal widgets
### Files (new)
- `src/modules/billing/billing.routes.ts`
- `src/modules/billing/billing.service.ts`

### Files (modify)
- `src/app.ts` mount under client router:
  - `clientRouter.use('/billing', billingRouter)`

### Endpoints
- `GET /api/clients/:clientId/billing/plan` (proxy to current plan)
- `GET /api/clients/:clientId/billing/allowance/current`
  - returns:
    - `period_start`
    - `free_minutes_total`, `free_minutes_used`, `free_minutes_remaining`
    - `billable_minutes_to_date` (sum over period)
  - This is a small set of queries; OK to do in backend (no RPC needed).

### Acceptance (Commit 7)
- Portal can render:
  - current plan
  - this month remaining free hours
  - billable minutes to date

---

## Commit 8 — Tests + docs (minimal)
### Files
- Add minimal tests if repo has test infra:
  - plan assignment: active closes
  - invoice flow: OPEN→REVIEW→PAID
  - time entry: free/billable split
- Update swagger annotations where needed

### Acceptance (Commit 8)
- `npm test`/`pnpm test` green (or at least smoke tests)
- Swagger lists new endpoints (dev)

---

## Final QA Checklist
1) Tenant isolation:
- client A cannot read client B invoices/time entries/plan
2) Manual billing:
- admin create invoice, client proof upload, admin decision
3) Time tracking correctness:
- free minutes deplete then billable increments
4) Audit coverage:
- plan change, invoice actions, time entry creation are all logged
5) Bubble compatibility:
- responses include expected fields (ids, status strings)

---

## Notes / Assumptions
- Admin identity is available as `req.user.id` (supabase JWT)
- `validateClientAccess` already enforces clientId path access
- Documents upload remains via existing `/documents/upload` with Idempotency-Key
- Invoice/proof documents are linked via `documents.id` only (storage handled by existing docs module)
