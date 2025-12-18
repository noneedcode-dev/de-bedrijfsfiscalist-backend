# Tax Calendar Homepage Endpoints - Implementation Summary

## Overview
Two new REST API endpoints have been implemented for the Company Dashboard homepage widgets:
1. **GET /api/clients/:clientId/tax/calendar/summary** - Status cards with aggregated statistics
2. **GET /api/clients/:clientId/tax/calendar/upcoming** - Upcoming deadlines list

## Implementation Details

### Files Modified
- `src/modules/taxCalendar/taxCalendar.routes.ts` - Added helper functions and two new endpoints

### Files Created
- `tests/taxCalendar.summary.test.ts` - Unit tests for /summary endpoint
- `tests/taxCalendar.upcoming.test.ts` - Unit tests for /upcoming endpoint
- `.env.example` - Added APP_DEFAULT_TZ configuration

## Endpoint 1: GET /api/clients/:clientId/tax/calendar/summary

### Purpose
Returns aggregated counts and statistics for tax calendar entries (homepage status cards).

### Query Parameters
- `from` (optional) - ISO date, filter entries from this date
- `to` (optional) - ISO date, filter entries up to this date
- `status` (optional) - Filter by status (exact match)
- `jurisdiction` (optional) - Filter by jurisdiction (exact match)
- `tax_type` (optional) - Filter by tax type (exact match)
- `period_label` (optional) - Filter by period label (exact match)
- `dueSoonDays` (optional) - Number of days for due soon calculation (default: 30, min: 1, max: 365)
- `breakdown` (optional) - Include breakdown by tax type (default: true)

### Response Format
```json
{
  "data": {
    "total": 0,
    "by_status": {
      "pending": 0,
      "in_progress": 0,
      "done": 0,
      "not_applicable": 0
    },
    "overdue": 0,
    "due_soon": 0,
    "by_tax_type": {
      "Dutch Corporate Income Tax": {
        "total": 0,
        "by_status": { ... },
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
```

### Business Logic
- **overdue**: `deadline < today AND status != 'done'`
- **due_soon**: `today <= deadline <= today + dueSoonDays AND status != 'done'`
- Timezone-safe date calculations using `APP_DEFAULT_TZ` (default: Europe/Amsterdam)

## Endpoint 2: GET /api/clients/:clientId/tax/calendar/upcoming

### Purpose
Returns upcoming tax calendar entries for homepage "Tax Calendar" widget.

### Query Parameters
- `months` (optional) - Number of months to look ahead (default: 3, min: 1, max: 24)
- `limit` (optional) - Maximum number of entries to return (default: 10, min: 1, max: 50)
- `jurisdiction` (optional) - Filter by jurisdiction (exact match)
- `tax_type` (optional) - Filter by tax type (exact match)
- `period_label` (optional) - Filter by period label (exact match)
- `status` (optional) - Filter by status; if omitted, excludes 'done' entries by default

### Response Format
```json
{
  "data": [
    {
      "id": "uuid",
      "client_id": "uuid",
      "jurisdiction": "NL",
      "tax_type": "Dutch VAT",
      "period_label": "2025-Q1",
      "deadline": "2025-01-31",
      "status": "pending",
      ...
    }
  ],
  "meta": {
    "count": 0,
    "range": {
      "from": "YYYY-MM-DD",
      "to": "YYYY-MM-DD"
    },
    "timestamp": "ISO"
  }
}
```

### Business Logic
- Date range: from today to today + months
- Ordering: deadline ASC
- Default filter: status != 'done' (when status param is not provided)
- Limit: default 10 entries

## Helper Functions

Three timezone-safe utility functions were added:

```typescript
// Get ISO date string in specified timezone
function isoDateInTZ(timeZone: string = DEFAULT_TZ, date?: Date): string

// Add days to a date
function addDays(date: Date, days: number): Date

// Add months to a date
function addMonths(date: Date, months: number): Date
```

## Security & Authentication

Both endpoints:
- ✅ Require Bearer JWT token (401 if missing)
- ✅ Use Supabase user client (RLS enabled)
- ✅ Validate clientId as UUID (400 if invalid)
- ✅ Apply express-validator rules for all query parameters

## Environment Configuration

Add to your `.env` file:
```bash
APP_DEFAULT_TZ=Europe/Amsterdam
```

This is optional and defaults to `Europe/Amsterdam` if not set.

## Testing

### Run Tests
```bash
npm test
```

### Test Coverage
- ✅ Authentication tests (401 when token missing/invalid)
- ✅ Validation tests (400 for invalid parameters)
- ✅ Happy path tests (200 with correct data)
- ✅ Error handling tests (500 for Supabase errors)
- ✅ Business logic tests (overdue, due_soon calculations)
- ✅ Filter tests (status, jurisdiction, tax_type, etc.)

## Example Usage

### Get Summary Statistics
```bash
curl -X GET \
  'http://localhost:3000/api/clients/123e4567-e89b-12d3-a456-426614174000/tax/calendar/summary?dueSoonDays=30&breakdown=true' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'x-api-key: YOUR_API_KEY'
```

### Get Upcoming Deadlines
```bash
curl -X GET \
  'http://localhost:3000/api/clients/123e4567-e89b-12d3-a456-426614174000/tax/calendar/upcoming?months=3&limit=10' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'x-api-key: YOUR_API_KEY'
```

## OpenAPI Documentation

Both endpoints include comprehensive OpenAPI annotations:
- Complete parameter documentation
- Response schema definitions
- Error response references
- Example values

Access Swagger UI at: `http://localhost:3000/api-docs` (if configured)

## Performance Considerations

- **Minimal data fetching**: /summary only fetches `status`, `deadline`, `tax_type` columns
- **In-memory aggregation**: Aggregation is performed in Node.js (not in database)
- **Efficient filtering**: All filters are applied at database level before fetching
- **Pagination**: /upcoming endpoint supports limit parameter

## Status Values

Database status enum (lowercase):
- `pending`
- `in_progress`
- `done`
- `not_applicable`

Status normalization is handled with `.toLowerCase()` for case-insensitive comparison.

## Timezone Handling

All date comparisons use timezone-safe calculations:
- Uses `Intl.DateTimeFormat` with 'en-CA' locale for YYYY-MM-DD format
- Respects `APP_DEFAULT_TZ` environment variable
- Prevents server timezone surprises

## Next Steps

1. ✅ Code compiled successfully
2. ✅ Tests written and ready to run
3. ✅ OpenAPI documentation added
4. ✅ Environment configuration documented
5. 🔄 Run integration tests with real Supabase instance
6. 🔄 Test with Postman/Thunder Client
7. 🔄 Deploy to staging environment

## Notes

- RLS policies are respected (user client, not service-role)
- All endpoints follow existing project patterns
- Error messages are descriptive and actionable
- Validation is comprehensive with clear error messages
