# Backend Change Request — Tax Calendar Homepage Summaries (Windsurf)

## Goal
Add two backend endpoints to power the Company Dashboard homepage widgets:
1) **Status cards** (counts, overdue, due soon, optional breakdown by tax type)
2) **Upcoming deadlines list** (next X months, not done by default)

**Tech:** Express + TypeScript + Supabase (user client via Bearer JWT)  
**Important:** Do NOT use service-role for these endpoints. Must respect RLS.

---

## Existing Context / Assumptions
- There is an existing router module: `src/modules/taxCalendar/taxCalendar.routes.ts`
- There is already a `GET /api/clients/:clientId/tax/calendar` endpoint (list).
- Standard middleware exists in the project: validation handling, async handler, AppError, createSupabaseUserClient(token).
- Supabase table: `tax_return_calendar_entries`
- Status values are lowercase enums in DB (assumption based on earlier migration notes):  
  `pending | in_progress | done | not_applicable`

> If current DB status values differ (e.g., "In Progress" text), adapt comparisons accordingly but keep response consistent.

---

## Deliverables
### A) Add Endpoint: `GET /api/clients/:clientId/tax/calendar/summary`
Returns aggregated counts for homepage status cards.

#### Query params (all optional)
- `from` (ISO date or ISO datetime accepted; filtering uses `deadline`)
- `to` (ISO)
- `status` (exact match)
- `jurisdiction` (exact match)
- `tax_type` (exact match)
- `period_label` (exact match)
- `dueSoonDays` (int, default `30`, min 1 max 365)
- `breakdown` (boolean, default `true`) — if true, include `by_tax_type`

#### Response shape
```json
{
  "data": {
    "total": 0,
    "by_status": { "pending": 0, "in_progress": 0, "done": 0, "not_applicable": 0 },
    "overdue": 0,
    "due_soon": 0,
    "by_tax_type": {
      "Dutch Corporate Income Tax": {
        "total": 0,
        "by_status": { "pending": 0, "in_progress": 0, "done": 0, "not_applicable": 0 },
        "overdue": 0,
        "due_soon": 0
      }
    }
  },
  "meta": {
    "today": "YYYY-MM-DD",
    "due_soon_to": "YYYY-MM-DD",
    "timestamp": "ISO"
  }
}
Business logic

overdue = deadline < today AND status != 'done'

due_soon = today <= deadline <= today + dueSoonDays AND status != 'done'

today must be calculated timezone-safe using APP_DEFAULT_TZ (default Europe/Amsterdam).

Fetch only minimum columns for aggregation:

status, deadline, tax_type

Implementation notes

Validate clientId is UUID.

Require Authorization: Bearer <token>; if missing => 401.

Create Supabase user client: createSupabaseUserClient(token).

Query:

.from('tax_return_calendar_entries')

.select('status, deadline, tax_type')

.eq('client_id', clientId)

apply optional filters for query params

Aggregate in Node (JS object maps).

B) Add Endpoint: GET /api/clients/:clientId/tax/calendar/upcoming

Returns upcoming deadlines list for homepage “Tax Calendar” widget.

Query params (optional)

months (int, default 3, min 1 max 24)

limit (int, default 10, min 1 max 50)

jurisdiction (exact match)

tax_type (exact match)

period_label (exact match)

status (if provided, exact match; if omitted => default status != 'done')

Response shape
{
  "data": [ /* rows from tax_return_calendar_entries */ ],
  "meta": {
    "count": 0,
    "range": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
    "timestamp": "ISO"
  }
}

Business logic

window range:

from = today (tz-safe)

to = today + months (tz-safe)

ordering: deadline ASC

default filter: status != done

limit: default 10

Files to Modify
1) src/modules/taxCalendar/taxCalendar.routes.ts

Add:

helper functions for timezone-safe date-only values:

isoDateInTZ(timeZone, date?) => 'YYYY-MM-DD'

addDays(date, days)

addMonths(date, months)

route: /summary

route: /upcoming

OpenAPI docblocks (@openapi) consistent with existing style in repo

express-validator rules + existing handleValidationErrors

Helper Functions (must be added once)

Add at top of file (or a local util if you prefer minimal footprint):

DEFAULT_TZ = process.env.APP_DEFAULT_TZ || 'Europe/Amsterdam'

isoDateInTZ(DEFAULT_TZ) => 'YYYY-MM-DD' (use Intl.DateTimeFormat with en-CA)

addDays, addMonths

Status Normalization (critical)

Treat “done” as the only completed state for overdue/due soon exclusion.

If DB stores status differently (e.g., "Done"), normalize with .toLowerCase() when comparing.

Return by_status keys exactly as stored or normalized consistently (prefer normalized lowercase).

Required Validation / Errors

clientId invalid => 400 via validation middleware

Missing Bearer token => 401 AppError('Missing Bearer token', 401)

Supabase query error => 500 with message Failed to ...: ${error.message}

Tests (Minimum)

Create/extend tests (depending on repo test setup):

/summary

401 when Authorization missing

400 when clientId invalid

200 happy path (mock supabase response) validating:

total, by_status, overdue, due_soon

/upcoming

401 when missing Authorization

400 invalid clientId

200 happy path verifies:

default status != done applied when status param absent

deadline ordering and limit

Use the repo’s existing test pattern (supertest/vitest/jest). Prefer mocking createSupabaseUserClient to return a fake query builder.

Acceptance Criteria

Both endpoints compile and run.

Both endpoints use Supabase user client (Bearer token) and respect RLS.

Timezone-safe today used for comparisons (no local server timezone surprises).

overdue and due_soon numbers are correct.

upcoming respects range, sort, and limit.

OpenAPI annotations added and consistent.