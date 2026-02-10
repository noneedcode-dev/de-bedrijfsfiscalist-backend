# Windsurf Plan — Time Tracking + Basit Timer (MVP) (De Bedrijfsfiscalist Backend)

## Goal
Time tracking’i backend’e ekle:
- Time entry CRUD (admin)
- Client/admin monthly summary (included/used/remaining/billable)
- Basit timer (start/stop) — backend timer state tutar, stop’ta time_entry oluşturur
- Audit log ile izlenebilirlik
- Multi-tenant / client-scoped güvenlik ve izolasyon

> Timer MVP scope:
> - (client_id + advisor_user_id) başına tek aktif timer
> - pause/resume yok, auto-stop yok
> - client tarafında timer UI yok (sadece summary + list)

---

## Assumptions (min)
- `clients` tablosu mevcut
- `app_users` tablosu mevcut (advisor/admin user id buradan)
- JWT payload’da `role` (admin|client) ve client role için `client_id` var
- Express backend zaten `/api/clients/:clientId` altında clientRouter pattern’ini kullanıyor
- Audit log servisi mevcut (auditLogService.logAsync)

---

## Branch
- `feat/time-tracking-mvp`

---

## Deliverables
1) DB (Supabase)
- `client_time_allowances` (included minutes/month)
- `time_entries` (soft delete)
- `active_timers` (basit timer state)

2) Backend routes (client scoped)
- `GET /api/clients/:clientId/time-entries`
- `GET /api/clients/:clientId/time-entries/summary?year_month=YYYY-MM`
- `POST /api/clients/:clientId/time-entries` (admin only)
- `PATCH /api/clients/:clientId/time-entries/:id` (admin only)
- `DELETE /api/clients/:clientId/time-entries/:id` (admin only)
- `POST /api/clients/:clientId/time-entries/timer/start` (admin only)
- `POST /api/clients/:clientId/time-entries/timer/stop` (admin only)
- `GET /api/clients/:clientId/time-entries/timer/active` (admin only)  ✅ Bubble reload/refresh için

3) Audit actions
- TIME_ENTRIES_LIST_VIEWED
- TIME_ENTRIES_SUMMARY_VIEWED
- TIME_ENTRY_CREATED
- TIME_ENTRY_UPDATED
- TIME_ENTRY_DELETED
- TIME_ENTRY_TIMER_STARTED
- TIME_ENTRY_TIMER_STOPPED
- TIME_ENTRY_TIMER_ACTIVE_VIEWED

4) Tests (Vitest)
- summary math
- admin-only enforcement
- timer start/stop happy path
- timer “already running” 409

---

## Step 0 — Local prep
- Backend repo root: unzip + install
- `.env` test/local hazır
- `npm test` baseline yeşil

---

## Step 1 — DB Migration (Supabase)
### 1.1 Add migration SQL
Create file:
- `supabase/migrations/20260204_add_time_tracking_mvp.sql`

SQL içerik:
- `client_time_allowances`
- `time_entries` (minutes, entry_date, task, advisor_user_id, source, soft delete columns)
- `active_timers`:
  - `id uuid pk default gen_random_uuid()`
  - `client_id uuid not null references clients(id) on delete cascade`
  - `advisor_user_id uuid not null references app_users(id) on delete restrict`
  - `started_at timestamptz not null default now()`
  - `started_by uuid references app_users(id)`
  - `created_at timestamptz not null default now()`
  - Unique constraint: `(client_id, advisor_user_id)`  ✅ tek aktif timer garantisi
- Indexler:
  - time_entries: `(client_id, entry_date desc)`, `(client_id, advisor_user_id, entry_date desc)`
  - active_timers: `(client_id, advisor_user_id)` unique zaten, ayrıca `(client_id)` opsiyonel
- RLS enable:
  - client_time_allowances: client kendi client_id SELECT, admin ALL
  - time_entries: client kendi client_id SELECT (deleted_at null), admin ALL
  - active_timers: **client erişimi yok** (policy yazma), admin ALL

✅ Acceptance
- Migration apply sonrası tablolar oluşuyor
- active_timers unique constraint çalışıyor (duplicate insert fail)

Commit:
- `chore(db): add time tracking tables (allowances, entries, active timers)`

---

## Step 2 — Audit constants
Edit:
- `src/constants/auditActions.ts`

Add:
- TIME_ENTRIES_LIST_VIEWED
- TIME_ENTRIES_SUMMARY_VIEWED
- TIME_ENTRY_CREATED
- TIME_ENTRY_UPDATED
- TIME_ENTRY_DELETED
- TIME_ENTRY_TIMER_STARTED
- TIME_ENTRY_TIMER_STOPPED
- TIME_ENTRY_TIMER_ACTIVE_VIEWED

Commit:
- `chore(audit): add time tracking actions`

---

## Step 3 — Backend module: timeEntries
Create folder:
- `src/modules/timeEntries/`

### 3.1 Service layer
Create:
- `src/modules/timeEntries/timeEntries.service.ts`

Functions:
- `listTimeEntries(supabase, { clientId, from?, to?, advisorUserId?, limit })`
- `getMonthlySummary(supabase, { clientId, yearMonth? })`
  - allowance: `client_time_allowances.included_minutes_monthly` (default 0)
  - entries sum: time_entries minutes (deleted_at null) between month range
  - compute:
    - used_minutes
    - remaining_included_minutes = max(0, included - used)
    - billable_minutes = max(0, used - included)
- `createTimeEntry(...)`
- `updateTimeEntry(...)`
- `softDeleteTimeEntry(...)`

Timer functions (admin-only):
- `startTimer(...)`
  - attempt insert into `active_timers` with `(client_id, advisor_user_id)`
  - unique violation => throw 409 already_running
- `stopTimer(...)`
  - select active timer row (client_id+advisor_user_id)
  - if none => 404 no_active_timer
  - duration = now - started_at (rounding rule: ceil to 1 minute)
  - insert into `time_entries` with:
    - entry_date = today (UTC) OR business rule: date derived from started_at (recommended)
    - minutes = durationMinutes
    - task optional (from request)
    - source = 'timer'
    - created_by = actor
  - delete row from `active_timers`
- `getActiveTimer(...)`
  - returns started_at if exists else null

Rounding rule (MVP, non-controversial):
- `minutes = Math.max(1, Math.ceil(ms / 60000))`

### 3.2 Routes
Create:
- `src/modules/timeEntries/timeEntries.routes.ts`

Routes (mount root: `/api/clients/:clientId/time-entries`):
- GET `/` list (admin + client)
- GET `/summary` (admin + client)
- POST `/` create (admin only)
- PATCH `/:id` (admin only)
- DELETE `/:id` soft delete (admin only)
- POST `/timer/start` (admin only)
  - body: `{ advisor_user_id, task? }` (task opsiyonel; stop’ta da alınabilir)
- POST `/timer/stop` (admin only)
  - body: `{ advisor_user_id, task? }`
- GET `/timer/active?advisor_user_id=...` (admin only)

Auth:
- her route x-api-key + JWT gerektiriyor (mevcut middleware chain)
- admin-only: `requireRole('admin')`
- client routes: validateClientAccess zaten clientRouter seviyesinde çalışıyor

Audit logging:
- list view -> TIME_ENTRIES_LIST_VIEWED
- summary -> TIME_ENTRIES_SUMMARY_VIEWED
- create/update/delete -> ilgili action
- timer start/stop/active -> ilgili action

Error mapping:
- already running -> 409 `{ code: 'TIME_TIMER_ALREADY_RUNNING', ... }`
- no active -> 404 `{ code: 'TIME_TIMER_NOT_RUNNING', ... }`

Commit:
- `feat(time): add time entries + summary + timer service/routes`

---

## Step 4 — App router mount
Edit:
- `src/app.ts`

Add import:
- `import { timeEntriesRouter } from './modules/timeEntries/timeEntries.routes';`

Mount under clientRouter:
- `clientRouter.use('/time-entries', timeEntriesRouter);`

Commit:
- `feat(app): mount time entries routes`

---

## Step 5 — Tests
Create:
- `tests/timeEntries.timer.test.ts`
- `tests/timeEntries.summary.test.ts`

Mock strategy:
- Use existing test helpers (scripted supabase mock) pattern.
- Verify:
  1) Summary math: included=240, used=300 => remaining=0, billable=60
  2) Client cannot POST time entry => 403
  3) Timer start ok => 200/201, audit call made (optional assert if mockable)
  4) Timer start twice => 409 TIME_TIMER_ALREADY_RUNNING
  5) Timer stop without active => 404 TIME_TIMER_NOT_RUNNING
  6) Timer stop creates time_entry minutes >= 1

Commit:
- `test(time): add summary and timer coverage`

---

## Step 6 — Bubble integration notes (non-code checklist)
> Bu kısım backend PR’ına bloklamaz ama rollout için gerekli.

Admin panel:
- Start: call `POST /time-entries/timer/start` with advisor_user_id (+ optional task)
- Stop: call `POST /time-entries/timer/stop` with same advisor_user_id (+ optional task)
- Page load / refresh:
  - call `GET /time-entries/timer/active?advisor_user_id=...`
  - if active: show “running since …” and render UI counter client-side
Client board:
- show `GET /time-entries/summary?year_month=YYYY-MM`
- optional list: `GET /time-entries?from&to` (client read-only)

---

## Rollout plan
1) Deploy migration
2) Deploy backend
3) Smoke test with one clientId:
   - set allowance row: 240 minutes
   - create manual entries + timer entry
   - verify summary
4) Enable Bubble UI buttons

---

## PR Checklist (must)
- [ ] All endpoints require `x-api-key`
- [ ] JWT enforced + validateClientAccess works for client routes
- [ ] Admin-only enforced on create/update/delete + timer endpoints
- [ ] active_timers uniqueness prevents double-start
- [ ] Summary math correct and stable
- [ ] Audit actions emitted for list/summary/create/update/delete/timer start/stop
- [ ] Tests green
- [ ] Error responses follow `{ code, message, details?, request_id, timestamp }`

---

## Acceptance criteria
- Admin can start timer for (client, advisor); second start returns 409
- Admin can stop timer; 1 time_entry created with source='timer'
- Client can view list + summary but cannot mutate or use timer
- Monthly summary returns included/used/remaining/billable correctly
- All actions appear in audit log with correct client_id and actor metadata

---

## Suggested commit sequence
1) `chore(db): add time tracking tables (allowances, entries, active timers)`
2) `chore(audit): add time tracking actions`
3) `feat(time): add time entries + summary + timer service/routes`
4) `feat(app): mount time entries routes`
5) `test(time): add summary and timer coverage`
