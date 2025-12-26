# GET /api/admin/users - Implementation Guide

## Overview
The GET /api/admin/users endpoint has been successfully extended with role filtering, client_id filtering, search capabilities, and pagination.

## Endpoint Details

**URL:** `GET /api/admin/users`

**Authentication:** Requires JWT Bearer token with `admin` role

**Authorization:** Admin role only (enforced by `requireRole('admin')` middleware)

## Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `role` | enum | No | - | Filter by role: `admin` or `client` |
| `client_id` | UUID | No | - | Filter by client ID |
| `search` | string | No | - | Search by email or full_name (case-insensitive) |
| `limit` | integer | No | 50 | Number of results (1-100) |
| `offset` | integer | No | 0 | Number of results to skip (≥0) |

## Response Format

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "admin",
      "is_active": true,
      "created_at": "2025-12-26T10:00:00Z",
      "client_id": "uuid-or-null"
    }
  ],
  "meta": {
    "count": 100,
    "limit": 50,
    "offset": 0,
    "timestamp": "2025-12-26T10:00:00Z"
  }
}
```

## Example Requests

### 1. Get all admin users
```bash
GET /api/admin/users?role=admin
```

### 2. Get all client users for a specific client
```bash
GET /api/admin/users?role=client&client_id=123e4567-e89b-12d3-a456-426614174000
```

### 3. Search users by email or name
```bash
GET /api/admin/users?search=john
```

### 4. Get admins with pagination
```bash
GET /api/admin/users?role=admin&limit=20&offset=40
```

### 5. Combined filters
```bash
GET /api/admin/users?role=admin&client_id=123e4567-e89b-12d3-a456-426614174000&search=doe&limit=10
```

## Implementation Details

### Files Modified

1. **`src/modules/admin/admin.routes.ts`** (lines 320-456)
   - Extended existing GET /api/admin/users endpoint
   - Added validation for `role`, `client_id`, and `search` parameters
   - Implemented filtering logic using Supabase query builder
   - Added comprehensive OpenAPI documentation

2. **`src/types/database.ts`** (lines 93-97)
   - Added `DbAppUserListItem` type for consistent response typing

### Key Features

- **Role Filter:** Filters users by exact role match (`admin` or `client`)
- **Client ID Filter:** Filters users by exact client_id match
- **Search Filter:** Uses PostgreSQL `ILIKE` for case-insensitive search on email and full_name
- **Pagination:** Supports limit (1-100) and offset (≥0) with defaults
- **Sorting:** Results ordered by `created_at DESC` (newest first)
- **Field Selection:** Returns only necessary fields (id, email, full_name, role, is_active, created_at, client_id)

### Validation

The endpoint validates:
- `role` must be either "admin" or "client"
- `client_id` must be a valid UUID
- `limit` must be between 1 and 100
- `offset` must be ≥ 0
- `search` is trimmed and sanitized

### Error Responses

- **401 Unauthorized:** Missing or invalid JWT token
- **403 Forbidden:** Non-admin user attempting access
- **400 Bad Request:** Invalid query parameters
- **500 Internal Server Error:** Database or server error

## Testing Manually

### Using cURL

```bash
# Get your admin JWT token first
TOKEN="your-admin-jwt-token"

# Test 1: Get all users
curl -X GET "http://localhost:3000/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-api-key: your-api-key"

# Test 2: Filter by role
curl -X GET "http://localhost:3000/api/admin/users?role=admin" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-api-key: your-api-key"

# Test 3: Filter by client_id
curl -X GET "http://localhost:3000/api/admin/users?client_id=YOUR-CLIENT-UUID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-api-key: your-api-key"

# Test 4: Search users
curl -X GET "http://localhost:3000/api/admin/users?search=test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-api-key: your-api-key"

# Test 5: Combined filters with pagination
curl -X GET "http://localhost:3000/api/admin/users?role=admin&limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-api-key: your-api-key"
```

### Using Postman

Import the updated `postman_collection.json` and test the endpoint with various query parameter combinations.

## Acceptance Criteria ✅

All acceptance criteria have been met:

1. ✅ `/api/admin/users?role=admin` returns only admins
2. ✅ `/api/admin/users?role=admin&client_id=<uuid>` filters further by client_id
3. ✅ Pagination works with limit and offset parameters
4. ✅ Search functionality works on email and full_name
5. ✅ Endpoint requires admin authentication
6. ✅ Returns proper response format with data and meta fields
7. ✅ OpenAPI schema updated with full documentation
8. ✅ TypeScript types defined and used

## OpenAPI Documentation

The endpoint is fully documented with OpenAPI 3.0 annotations. Access the Swagger UI at:
```
http://localhost:3000/api-docs
```

Look for the **Admin** tag and find the `GET /api/admin/users` endpoint.

## Database Query

The endpoint queries the `public.app_users` table with:
- Selected fields: `id, email, full_name, role, is_active, created_at, client_id`
- Filters applied conditionally based on query parameters
- Order: `created_at DESC`
- Count: Exact count returned in meta

## Notes

- The endpoint uses `createSupabaseAdminClient()` for database access
- All filters are optional and can be combined
- Search uses OR logic between email and full_name
- Results are always sorted by creation date (newest first)
- The `count` in meta represents total matching records, not just the current page
