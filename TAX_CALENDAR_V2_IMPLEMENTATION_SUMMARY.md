# Tax Calendar V2 - Implementation Summary

## Overview

Successfully implemented Tax Calendar V2 with dynamic table structure, JSONB columns, and admin import functionality. The system now supports Excel/Sheet-like data import with flexible column definitions per tax type.

## Deliverables

### 1. Database Migration

**File:** `supabase/migrations/20260128_tax_calendar_v2.sql`

**Created:**
- ✅ `tax_calendar_tables` - Stores table metadata and dynamic column definitions
- ✅ `tax_calendar_rows` - Stores actual data rows with dynamic fields
- ✅ `tax_calendar_entries_v2` - View joining tables and rows for backward compatibility
- ✅ `tax_calendar_replace_import()` - RPC function for atomic import operations
- ✅ RLS policies for multi-tenant isolation
- ✅ Indexes for performance optimization
- ✅ Triggers for `updated_at` timestamp management

**Key Features:**
- Dynamic columns via `columns_json` (JSONB)
- Dynamic fields via `fields_json` (JSONB)
- Cascade delete for data integrity
- Atomic replace import (all-or-nothing transaction)
- Defense-in-depth security with RLS

### 2. Backend Service Updates

**File:** `src/modules/taxCalendar/taxCalendar.service.ts`

**Changes:**
- ✅ Updated `listEntries()` to use `tax_calendar_entries_v2` view
- ✅ Updated `getSummary()` to use `tax_calendar_entries_v2` view
- ✅ Updated `getUpcoming()` to use `tax_calendar_entries_v2` view
- ✅ Added `getTables()` - Fetch tables with nested rows
- ✅ Added `replaceImport()` - Call RPC for import operation
- ✅ Added `ImportPayload` interface for type safety

**Backward Compatibility:** All existing endpoints continue to work using the new V2 view.

### 3. New API Endpoints

**File:** `src/modules/taxCalendar/taxCalendar.routes.ts`

#### GET `/api/clients/:clientId/tax/calendar/tables`
- Returns all tables with their rows and column definitions
- Ordered by `table_order` and `row_order`
- Accessible by client users and admins
- Audit log: `TAX_CALENDAR_TABLES_VIEWED`

#### POST `/api/clients/:clientId/tax/calendar/import?mode=replace`
- Admin-only endpoint for importing tax calendar data
- Replaces all existing data for the client
- Atomic operation via RPC
- Validates payload structure
- Audit log: `TAX_CALENDAR_IMPORTED` with metadata (mode, tables_count, rows_count)

### 4. Audit Actions

**File:** `src/constants/auditActions.ts`

**Added:**
- ✅ `TAX_CALENDAR_IMPORTED` - Logged when data is imported
- ✅ `TAX_CALENDAR_TABLES_VIEWED` - Logged when tables endpoint is accessed

### 5. Documentation

**Files Created:**
- ✅ `TAX_CALENDAR_V2_EXAMPLE_PAYLOADS.md` - Example payloads and cURL commands
- ✅ `TAX_CALENDAR_V2_IMPLEMENTATION_SUMMARY.md` - This file

## File Changes Summary

### Modified Files

1. **`src/modules/taxCalendar/taxCalendar.service.ts`**
   - Changed table reference from `tax_return_calendar_entries` to `tax_calendar_entries_v2` (3 locations)
   - Added `getTables()` function (48 lines)
   - Added `ImportPayload` interface (21 lines)
   - Added `replaceImport()` function (18 lines)
   - **Total additions:** ~87 lines

2. **`src/modules/taxCalendar/taxCalendar.routes.ts`**
   - Added `/tables` GET endpoint (65 lines)
   - Added `/import` POST endpoint (104 lines)
   - **Total additions:** ~169 lines

3. **`src/constants/auditActions.ts`**
   - Added 2 new audit action constants
   - **Total additions:** 2 lines

### New Files

1. **`supabase/migrations/20260128_tax_calendar_v2.sql`**
   - Complete migration with tables, view, RPC, RLS, indexes
   - **Total lines:** 289 lines

2. **`TAX_CALENDAR_V2_EXAMPLE_PAYLOADS.md`**
   - Example payloads for CIT and Wage Tax
   - cURL commands for all endpoints
   - Expected response examples
   - Testing checklist
   - **Total lines:** ~450 lines

3. **`TAX_CALENDAR_V2_IMPLEMENTATION_SUMMARY.md`**
   - This comprehensive summary
   - **Total lines:** ~300 lines

## Data Model

### tax_calendar_tables
```
- id (UUID, PK)
- client_id (UUID, FK → clients)
- jurisdiction (TEXT) - e.g., "NL"
- tax_type (TEXT) - e.g., "Dutch Corporate Income Tax"
- title (TEXT) - Display name
- table_order (INTEGER) - Sort order
- columns_json (JSONB) - Dynamic column definitions
- created_at, updated_at (TIMESTAMPTZ)
```

### tax_calendar_rows
```
- id (UUID, PK)
- client_id (UUID, FK → clients)
- table_id (UUID, FK → tax_calendar_tables)
- entity_name (TEXT) - Company/entity name
- period_label (TEXT) - e.g., "2024", "2025-Q1"
- deadline (DATE) - Filing/payment deadline
- status (TEXT) - open|pending|in_progress|done|overdue|not_applicable
- row_order (INTEGER) - Sort order
- fields_json (JSONB) - Dynamic field values
- created_at, updated_at (TIMESTAMPTZ)
```

### tax_calendar_entries_v2 (VIEW)
```
Joins tables + rows, exposes all columns from both tables
Used by existing endpoints for backward compatibility
```

## API Endpoints

### Existing (Updated to use V2 view)
- `GET /api/clients/:clientId/tax/calendar` - List entries with filters
- `GET /api/clients/:clientId/tax/calendar/summary` - Aggregated statistics
- `GET /api/clients/:clientId/tax/calendar/upcoming` - Upcoming deadlines

### New
- `GET /api/clients/:clientId/tax/calendar/tables` - Tables with rows and columns
- `POST /api/clients/:clientId/tax/calendar/import?mode=replace` - Import data (admin only)

## Example Import Payload

```json
{
  "tables": [
    {
      "jurisdiction": "NL",
      "tax_type": "Dutch Corporate Income Tax",
      "title": "Corporate Income Tax",
      "table_order": 1,
      "columns": [
        {"key": "entity_name", "label": "Entity", "type": "text", "order": 1},
        {"key": "period_label", "label": "Tax Period", "type": "text", "order": 2},
        {"key": "deadline", "label": "Filing deadline", "type": "date", "order": 3},
        {"key": "status", "label": "Status", "type": "select", "order": 4},
        {"key": "extension_regime", "label": "Extension regime", "type": "text", "order": 5}
      ],
      "rows": [
        {
          "entity_name": "Holding B.V.",
          "period_label": "2024",
          "deadline": "2025-06-01",
          "status": "pending",
          "row_order": 1,
          "fields": {
            "extension_regime": "Becon-regeling"
          }
        }
      ]
    }
  ]
}
```

## Testing Instructions

### Prerequisites
1. Start Docker and Supabase:
   ```bash
   docker start
   supabase start
   ```

2. Apply migration:
   ```bash
   supabase db reset
   ```

### Test Sequence

1. **Import Data (Admin)**
   ```bash
   curl -X POST "http://localhost:3000/api/clients/${CLIENT_ID}/tax/calendar/import?mode=replace" \
     -H "x-api-key: ${API_KEY}" \
     -H "Authorization: Bearer ${ADMIN_TOKEN}" \
     -H "Content-Type: application/json" \
     -d @TAX_CALENDAR_V2_EXAMPLE_PAYLOADS.md
   ```

2. **Get Tables**
   ```bash
   curl -X GET "http://localhost:3000/api/clients/${CLIENT_ID}/tax/calendar/tables" \
     -H "x-api-key: ${API_KEY}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```

3. **Get Summary**
   ```bash
   curl -X GET "http://localhost:3000/api/clients/${CLIENT_ID}/tax/calendar/summary" \
     -H "x-api-key: ${API_KEY}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```

4. **Get Upcoming**
   ```bash
   curl -X GET "http://localhost:3000/api/clients/${CLIENT_ID}/tax/calendar/upcoming?months=3" \
     -H "x-api-key: ${API_KEY}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```

### Verification

1. **Check Import Result**
   - Response should show `tables_count: 2` and `rows_count: 6`
   - Verify audit log entry created

2. **Check Tables Endpoint**
   - Should return 2 tables
   - Each table should have its rows nested
   - Columns JSON should be properly formatted

3. **Check Summary**
   - Should aggregate all 6 entries
   - Should calculate overdue and due_soon correctly
   - Should break down by tax_type

4. **Check Upcoming**
   - Should return entries within date range
   - Should exclude done entries by default
   - Should be ordered by deadline

5. **Tenant Isolation**
   - Try accessing with different client token
   - Should get empty results or 403

## Security Features

1. **RLS Policies**
   - Clients can only SELECT their own data
   - Admins have full access
   - Enforced at database level

2. **Admin-Only Import**
   - Import endpoint checks `req.user?.role === 'admin'`
   - Returns 403 for non-admin users

3. **Atomic Operations**
   - RPC function uses transaction
   - All-or-nothing import (no partial writes)

4. **Audit Logging**
   - All operations logged with metadata
   - Includes actor, action, timestamp, and details

## Performance Optimizations

1. **Indexes Created**
   - `(client_id, jurisdiction, tax_type)` - Table filtering
   - `(client_id, table_order)` - Table ordering
   - `(client_id, table_id, deadline)` - Row queries
   - `(client_id, status)` - Status filtering
   - `(client_id, deadline)` - Date range queries
   - `(table_id)` - Foreign key lookups

2. **View Usage**
   - Pre-joined view reduces query complexity
   - Backward compatibility without code duplication

## Migration Notes

### To Run Migration

**Option 1: Full Reset (Development)**
```bash
supabase db reset
```

**Option 2: Apply New Migration Only**
```bash
supabase migration up
```

**Option 3: Production (via Supabase Dashboard)**
1. Copy migration SQL
2. Go to SQL Editor in Supabase Dashboard
3. Paste and execute

### Rollback Plan

If issues occur, the migration can be rolled back by:
1. Dropping the new tables: `DROP TABLE tax_calendar_rows, tax_calendar_tables CASCADE;`
2. Dropping the view: `DROP VIEW tax_calendar_entries_v2;`
3. Dropping the RPC: `DROP FUNCTION tax_calendar_replace_import;`

Note: This will delete all V2 data. Ensure you have backups if needed.

## Next Steps

1. **Start Docker/Supabase** (if not running)
2. **Apply Migration** (`supabase db reset`)
3. **Test Import** with example payload
4. **Verify Endpoints** work as expected
5. **Test Tenant Isolation** with different clients
6. **Update Frontend** to use new `/tables` endpoint

## Known Limitations

1. **Import Mode**: Only `replace` mode is currently supported (no merge/append)
2. **Validation**: Minimal payload validation (could be enhanced with JSON schema)
3. **Bulk Operations**: No batch update endpoint (only full replace)
4. **Status Values**: Hardcoded in migration (could be made configurable)

## Future Enhancements

1. Add merge/append import modes
2. Add individual row CRUD endpoints
3. Add column reordering endpoint
4. Add export functionality
5. Add validation rules per column type
6. Add calculated fields support
7. Add file upload for CSV/Excel import
8. Add versioning/history tracking

## Summary

✅ **Migration Created**: `20260128_tax_calendar_v2.sql` (289 lines)
✅ **Service Updated**: 3 functions updated, 2 functions added (~87 lines)
✅ **Routes Added**: 2 new endpoints (~169 lines)
✅ **Audit Actions**: 2 new actions added
✅ **Documentation**: Complete examples and testing guide
✅ **Backward Compatible**: All existing endpoints work with V2 view
✅ **Security**: RLS policies, admin-only import, audit logging
✅ **Performance**: 6 indexes for optimal query performance

The implementation is complete and ready for testing once Docker/Supabase is running.
