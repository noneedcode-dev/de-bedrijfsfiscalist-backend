# Admin Time Entries Global Endpoint

## Overview
Global time entries listing endpoint for admin users to view all time tracking records across all clients.

## Endpoint
**GET** `/api/admin/time-entries`

## Authentication & Authorization
- **API Key**: Required (via `x-api-key` header)
- **JWT**: Required (via `Authorization: Bearer <token>`)
- **Role**: Admin only (`requireRole('admin')`)

## Query Parameters

| Parameter | Type | Required | Default | Max | Description |
|-----------|------|----------|---------|-----|-------------|
| `client_id` | UUID | No | - | - | Filter by specific client |
| `advisor_id` | UUID | No | - | - | Filter by specific advisor |
| `billable` | boolean | No | - | - | Filter by billable status (`true` or `false`) |
| `from` | Date | No | - | - | Start date filter (YYYY-MM-DD) |
| `to` | Date | No | - | - | End date filter (YYYY-MM-DD) |
| `page` | integer | No | 1 | - | Page number (min: 1) |
| `limit` | integer | No | 50 | 200 | Results per page (min: 1, max: 200) |

## Response Format

```json
{
  "data": [
    {
      "id": "uuid",
      "client_id": "uuid",
      "advisor_user_id": "uuid",
      "entry_date": "2026-02-20",
      "worked_at": "2026-02-20T10:00:00Z",
      "minutes": 60,
      "free_minutes_consumed": 60,
      "billable_minutes": 0,
      "task": "Tax consultation",
      "is_billable": false,
      "source": "manual",
      "created_at": "2026-02-20T10:00:00Z",
      "created_by": "uuid",
      "updated_at": null,
      "updated_by": null,
      "deleted_at": null,
      "deleted_by": null
    }
  ],
  "pagination": {
    "total": 123,
    "page": 1,
    "limit": 50
  }
}
```

## Sorting
Results are sorted by:
1. `entry_date` (descending)
2. `created_at` (descending)

## Examples

### List all time entries (default pagination)
```bash
curl -sS \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:3000/api/admin/time-entries"
```

### Filter by client and date range
```bash
curl -sS \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:3000/api/admin/time-entries?client_id=13becdf9-23b1-49a9-9cb7-a20c0426ffcd&from=2026-01-01&to=2026-02-20"
```

### Filter by advisor and billable status
```bash
curl -sS \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:3000/api/admin/time-entries?advisor_id=USER_ID&billable=true&page=1&limit=100"
```

### Pagination example
```bash
curl -sS \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:3000/api/admin/time-entries?page=2&limit=25"
```

## Error Responses

### 401 Unauthorized
Missing or invalid JWT token
```json
{
  "error": {
    "code": "AUTH_INVALID_TOKEN",
    "message": "Invalid or expired token"
  }
}
```

### 403 Forbidden
User does not have admin role
```json
{
  "error": {
    "code": "AUTH_INSUFFICIENT_PERMISSIONS",
    "message": "Insufficient permissions"
  }
}
```

### 422 Validation Error
Invalid query parameters
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed",
    "details": [
      {
        "field": "client_id",
        "message": "Invalid client_id format"
      }
    ]
  }
}
```

## Database Indexes
The following indexes optimize query performance:

- `idx_time_entries_client_date`: Client + date filtering
- `idx_time_entries_advisor`: Advisor filtering
- `idx_time_entries_entry_date`: Date sorting
- `idx_time_entries_billable`: Billable filtering
- `idx_time_entries_client_advisor_date`: Combined filters

## Audit Logging
All requests are logged with:
- Action: `TIME_ENTRIES_LIST_VIEWED`
- Scope: `global_admin`
- Filters applied
- Result count
- IP address and user agent

## Security Notes
- Multi-tenant isolation is **bypassed** for this endpoint (admin global view)
- RLS policies must allow admin service role to read all time_entries
- No `validateClientAccess` middleware applied
- Only accessible to users with `role=admin` in JWT

## Implementation Files
- Controller: `src/modules/timeEntries/timeEntries.admin.controller.ts`
- Routes: `src/modules/timeEntries/timeEntries.admin.routes.ts`
- Migration: `supabase/migrations/20260220_time_entries_admin_indexes.sql`
- Mounted in: `src/app.ts`
