# Tax Calendar V2 - Example Payloads & Testing Guide

## Example Import Payload

This payload includes two tax types: Corporate Income Tax and Wage Tax.

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
        {"key": "extension_regime", "label": "Extension regime", "type": "text", "order": 5},
        {"key": "preliminary_assessment", "label": "Preliminary assessment", "type": "text", "order": 6},
        {"key": "tax_interest", "label": "Tax interest", "type": "number", "order": 7},
        {"key": "remarks", "label": "Remarks", "type": "multiline", "order": 8},
        {"key": "important_positions", "label": "Important positions", "type": "multiline", "order": 9}
      ],
      "rows": [
        {
          "entity_name": "Holding B.V.",
          "period_label": "2024",
          "deadline": "2025-06-01",
          "status": "pending",
          "row_order": 1,
          "fields": {
            "extension_regime": "Becon-regeling",
            "preliminary_assessment": "Yes, paid timely",
            "tax_interest": 0,
            "remarks": "Annual return for fiscal year 2024\nDeadline can be extended to July 1st",
            "important_positions": "Participation exemption applied\nR&D tax credit claimed"
          }
        },
        {
          "entity_name": "Operating B.V.",
          "period_label": "2024",
          "deadline": "2025-06-01",
          "status": "in_progress",
          "row_order": 2,
          "fields": {
            "extension_regime": "Standard",
            "preliminary_assessment": "Yes, paid timely",
            "tax_interest": 1250,
            "remarks": "Additional payment required",
            "important_positions": "Innovation box regime\nForeign tax credits"
          }
        },
        {
          "entity_name": "Holding B.V.",
          "period_label": "2025",
          "deadline": "2026-06-01",
          "status": "open",
          "row_order": 3,
          "fields": {
            "extension_regime": "Becon-regeling",
            "preliminary_assessment": "Not yet filed",
            "tax_interest": 0,
            "remarks": "Future filing",
            "important_positions": ""
          }
        }
      ]
    },
    {
      "jurisdiction": "NL",
      "tax_type": "Dutch Wage Tax",
      "title": "Wage Tax & Social Security",
      "table_order": 2,
      "columns": [
        {"key": "entity_name", "label": "Entity", "type": "text", "order": 1},
        {"key": "period_label", "label": "Period", "type": "text", "order": 2},
        {"key": "deadline", "label": "Filing deadline", "type": "date", "order": 3},
        {"key": "status", "label": "Status", "type": "select", "order": 4},
        {"key": "payment_status", "label": "Payment status", "type": "text", "order": 5},
        {"key": "amount_due", "label": "Amount due", "type": "number", "order": 6},
        {"key": "remarks", "label": "Remarks", "type": "multiline", "order": 7}
      ],
      "rows": [
        {
          "entity_name": "Operating B.V.",
          "period_label": "2025-01",
          "deadline": "2025-02-28",
          "status": "done",
          "row_order": 1,
          "fields": {
            "payment_status": "Paid",
            "amount_due": 45000,
            "remarks": "Monthly wage tax declaration filed and paid"
          }
        },
        {
          "entity_name": "Operating B.V.",
          "period_label": "2025-02",
          "deadline": "2025-03-31",
          "status": "pending",
          "row_order": 2,
          "fields": {
            "payment_status": "Not yet paid",
            "amount_due": 47500,
            "remarks": "Upcoming deadline"
          }
        },
        {
          "entity_name": "Operating B.V.",
          "period_label": "2025-03",
          "deadline": "2025-04-30",
          "status": "open",
          "row_order": 3,
          "fields": {
            "payment_status": "Not yet calculated",
            "amount_due": 0,
            "remarks": ""
          }
        }
      ]
    }
  ]
}
```

## cURL Commands for Testing

### 1. Import Tax Calendar Data (Admin Only)

```bash
# Set your variables
export API_KEY="your-api-key"
export ADMIN_TOKEN="your-admin-jwt-token"
export CLIENT_ID="your-client-uuid"
export BASE_URL="http://localhost:3000"

# Import the data
curl -X POST "${BASE_URL}/api/clients/${CLIENT_ID}/tax/calendar/import?mode=replace" \
  -H "x-api-key: ${API_KEY}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
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
        {"key": "extension_regime", "label": "Extension regime", "type": "text", "order": 5},
        {"key": "preliminary_assessment", "label": "Preliminary assessment", "type": "text", "order": 6},
        {"key": "tax_interest", "label": "Tax interest", "type": "number", "order": 7},
        {"key": "remarks", "label": "Remarks", "type": "multiline", "order": 8}
      ],
      "rows": [
        {
          "entity_name": "Holding B.V.",
          "period_label": "2024",
          "deadline": "2025-06-01",
          "status": "pending",
          "row_order": 1,
          "fields": {
            "extension_regime": "Becon-regeling",
            "preliminary_assessment": "Yes, paid timely",
            "tax_interest": 0,
            "remarks": "Annual return for fiscal year 2024"
          }
        }
      ]
    },
    {
      "jurisdiction": "NL",
      "tax_type": "Dutch Wage Tax",
      "title": "Wage Tax & Social Security",
      "table_order": 2,
      "columns": [
        {"key": "entity_name", "label": "Entity", "type": "text", "order": 1},
        {"key": "period_label", "label": "Period", "type": "text", "order": 2},
        {"key": "deadline", "label": "Filing deadline", "type": "date", "order": 3},
        {"key": "status", "label": "Status", "type": "select", "order": 4},
        {"key": "payment_status", "label": "Payment status", "type": "text", "order": 5},
        {"key": "amount_due", "label": "Amount due", "type": "number", "order": 6}
      ],
      "rows": [
        {
          "entity_name": "Operating B.V.",
          "period_label": "2025-01",
          "deadline": "2025-02-28",
          "status": "done",
          "row_order": 1,
          "fields": {
            "payment_status": "Paid",
            "amount_due": 45000
          }
        }
      ]
    }
  ]
}
EOF
```

### 2. Get Tables (Client or Admin)

```bash
curl -X GET "${BASE_URL}/api/clients/${CLIENT_ID}/tax/calendar/tables" \
  -H "x-api-key: ${API_KEY}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### 3. Get Summary

```bash
curl -X GET "${BASE_URL}/api/clients/${CLIENT_ID}/tax/calendar/summary" \
  -H "x-api-key: ${API_KEY}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### 4. Get Upcoming

```bash
curl -X GET "${BASE_URL}/api/clients/${CLIENT_ID}/tax/calendar/upcoming?months=3&limit=10" \
  -H "x-api-key: ${API_KEY}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### 5. Get All Entries (Legacy endpoint, now using V2 view)

```bash
curl -X GET "${BASE_URL}/api/clients/${CLIENT_ID}/tax/calendar?limit=50" \
  -H "x-api-key: ${API_KEY}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

## Expected Response Examples

### Import Response

```json
{
  "success": true,
  "data": {
    "success": true,
    "tables_count": 2,
    "rows_count": 6,
    "client_id": "123e4567-e89b-12d3-a456-426614174000"
  },
  "meta": {
    "timestamp": "2026-01-28T01:15:00.000Z"
  }
}
```

### Tables Response

```json
{
  "data": [
    {
      "id": "table-uuid-1",
      "client_id": "client-uuid",
      "jurisdiction": "NL",
      "tax_type": "Dutch Corporate Income Tax",
      "title": "Corporate Income Tax",
      "table_order": 1,
      "columns_json": [
        {"key": "entity_name", "label": "Entity", "type": "text", "order": 1},
        {"key": "period_label", "label": "Tax Period", "type": "text", "order": 2},
        {"key": "deadline", "label": "Filing deadline", "type": "date", "order": 3},
        {"key": "status", "label": "Status", "type": "select", "order": 4}
      ],
      "created_at": "2026-01-28T01:15:00.000Z",
      "updated_at": "2026-01-28T01:15:00.000Z",
      "rows": [
        {
          "id": "row-uuid-1",
          "client_id": "client-uuid",
          "table_id": "table-uuid-1",
          "entity_name": "Holding B.V.",
          "period_label": "2024",
          "deadline": "2025-06-01",
          "status": "pending",
          "row_order": 1,
          "fields_json": {
            "extension_regime": "Becon-regeling",
            "preliminary_assessment": "Yes, paid timely",
            "tax_interest": 0,
            "remarks": "Annual return for fiscal year 2024"
          },
          "created_at": "2026-01-28T01:15:00.000Z",
          "updated_at": "2026-01-28T01:15:00.000Z"
        }
      ]
    }
  ],
  "meta": {
    "count": 2,
    "total_rows": 6,
    "timestamp": "2026-01-28T01:15:00.000Z"
  }
}
```

### Summary Response

```json
{
  "data": {
    "total": 6,
    "by_status": {
      "pending": 2,
      "in_progress": 1,
      "done": 1,
      "open": 2,
      "not_applicable": 0
    },
    "overdue": 0,
    "due_soon": 2,
    "by_tax_type": {
      "Dutch Corporate Income Tax": {
        "total": 3,
        "by_status": {
          "pending": 1,
          "in_progress": 1,
          "open": 1,
          "done": 0,
          "not_applicable": 0
        },
        "overdue": 0,
        "due_soon": 1
      },
      "Dutch Wage Tax": {
        "total": 3,
        "by_status": {
          "done": 1,
          "pending": 1,
          "open": 1,
          "in_progress": 0,
          "not_applicable": 0
        },
        "overdue": 0,
        "due_soon": 1
      }
    }
  },
  "meta": {
    "today": "2026-01-28",
    "due_soon_to": "2026-02-27",
    "timestamp": "2026-01-28T01:15:00.000Z"
  }
}
```

### Upcoming Response

```json
{
  "data": [
    {
      "row_id": "row-uuid-2",
      "client_id": "client-uuid",
      "table_id": "table-uuid-2",
      "jurisdiction": "NL",
      "tax_type": "Dutch Wage Tax",
      "title": "Wage Tax & Social Security",
      "table_order": 2,
      "columns_json": [...],
      "entity_name": "Operating B.V.",
      "period_label": "2025-02",
      "deadline": "2025-03-31",
      "status": "pending",
      "row_order": 2,
      "fields_json": {
        "payment_status": "Not yet paid",
        "amount_due": 47500,
        "remarks": "Upcoming deadline"
      },
      "row_created_at": "2026-01-28T01:15:00.000Z",
      "row_updated_at": "2026-01-28T01:15:00.000Z",
      "table_created_at": "2026-01-28T01:15:00.000Z",
      "table_updated_at": "2026-01-28T01:15:00.000Z"
    }
  ],
  "meta": {
    "count": 1,
    "range": {
      "from": "2026-01-28",
      "to": "2026-04-28"
    },
    "timestamp": "2026-01-28T01:15:00.000Z"
  }
}
```

## Testing Checklist

### 1. Import Functionality
- [ ] Import with valid payload succeeds
- [ ] Import replaces all existing data (no duplicates)
- [ ] Import is atomic (fails completely or succeeds completely)
- [ ] Admin-only restriction works (non-admin gets 403)
- [ ] Audit log entry created with correct metadata

### 2. Tables Endpoint
- [ ] Returns all tables with rows
- [ ] Tables ordered by `table_order`
- [ ] Rows ordered by `row_order` and `deadline`
- [ ] Columns JSON properly formatted
- [ ] Fields JSON properly formatted

### 3. Summary Endpoint
- [ ] Aggregates by status correctly
- [ ] Calculates overdue entries (deadline < today, status != done)
- [ ] Calculates due_soon entries (today <= deadline <= due_soon_to, status != done)
- [ ] Breakdown by tax_type works when requested
- [ ] Filters work (jurisdiction, tax_type, period_label, status)

### 4. Upcoming Endpoint
- [ ] Returns entries within date range (today to today + months)
- [ ] Excludes done entries by default
- [ ] Respects limit parameter
- [ ] Orders by deadline ascending
- [ ] Filters work (jurisdiction, tax_type, period_label, status)

### 5. Tenant Isolation
- [ ] Client A cannot see Client B's data
- [ ] Admin can see all clients' data
- [ ] RLS policies enforce isolation at DB level

### 6. Backward Compatibility
- [ ] Legacy `/calendar` endpoint still works
- [ ] Legacy `/calendar/summary` endpoint still works
- [ ] Legacy `/calendar/upcoming` endpoint still works
- [ ] All use `tax_calendar_entries_v2` view

## Migration Steps

1. **Start Docker/Supabase**
   ```bash
   docker start
   supabase start
   ```

2. **Apply Migration**
   ```bash
   supabase db reset
   # or
   supabase migration up
   ```

3. **Verify Tables Created**
   ```bash
   supabase db diff
   ```

4. **Test Import**
   - Use the cURL command above with your credentials
   - Verify response shows correct counts

5. **Test Read Endpoints**
   - Test `/tables` endpoint
   - Test `/summary` endpoint
   - Test `/upcoming` endpoint

6. **Verify Audit Logs**
   ```sql
   SELECT * FROM audit_logs 
   WHERE action = 'TAX_CALENDAR_IMPORTED' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```
