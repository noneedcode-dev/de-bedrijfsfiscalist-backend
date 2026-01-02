# TICKET 6: Add Audit Events for Documents Endpoints - Implementation Summary

## Overview
Implemented audit logging for documents endpoints using the audit service from Ticket 5. The implementation tracks document list views with comprehensive metadata including query parameters and request context.

## Implementation Details

### 1. Created Audit Action Constants
**File:** `src/constants/auditActions.ts` (NEW)

Defined audit action constants following the codebase pattern of using constants for standardized values:

```typescript
export const AuditActions = {
  DOCUMENTS_LIST_VIEWED: 'DOCUMENTS_LIST_VIEWED',
  DOCUMENT_URL_CREATED: 'DOCUMENT_URL_CREATED',
  DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
} as const;
```

- `DOCUMENTS_LIST_VIEWED`: Logged when GET /api/clients/:clientId/documents is called
- `DOCUMENT_URL_CREATED`: Reserved for future presigned URL generation endpoints
- `DOCUMENT_DOWNLOADED`: Reserved for future document download endpoints

### 2. Updated Documents Routes
**File:** `src/modules/documents/documents.routes.ts` (MODIFIED)

#### Changes Made:
1. **Added imports** (lines 7-8):
   - `auditLogService` from `../../services/auditLogService`
   - `AuditActions` from `../../constants/auditActions`

2. **Added audit logging** (lines 110-126):
   - Non-blocking audit log using `auditLogService.logAsync()`
   - Placed after successful data fetch, before response
   - Does not affect response time or error handling

#### Audit Log Metadata Captured:
```typescript
{
  client_id: clientId,
  actor_user_id: req.user?.sub,
  actor_role: req.user?.role,
  action: AuditActions.DOCUMENTS_LIST_VIEWED,
  entity_type: 'document',
  metadata: {
    query_params: {
      source: source || null,
      kind: kind || null,
    },
    result_count: data?.length ?? 0,
    ip: req.ip,
    user_agent: req.headers['user-agent'],
  },
}
```

## Files Changed

### New Files:
1. `src/constants/auditActions.ts` - Audit action constants

### Modified Files:
1. `src/modules/documents/documents.routes.ts` - Added audit logging to documents list endpoint

## Compliance with Requirements

✅ **Audit records for GET /api/clients/:clientId/documents** - Implemented with action `DOCUMENTS_LIST_VIEWED`

✅ **Metadata includes query parameters** - Captures `source` and `kind` query params

✅ **Metadata includes request context** - Captures `ip` and `user-agent` (safely available from Express)

✅ **Non-blocking audit** - Uses `auditLogService.logAsync()` to prevent blocking the response

✅ **Actor info from req.user** - Derives `actor_user_id` and `actor_role` from `req.user.sub` and `req.user.role`

✅ **Constants/enums pattern** - Created `AuditActions` constant object following codebase pattern

⚠️ **Download/presigned URL endpoints** - No such endpoints currently exist in the documents module. Constants `DOCUMENT_URL_CREATED` and `DOCUMENT_DOWNLOADED` are defined for future use.

## Current Documents Endpoints

The documents module currently has only one endpoint:
- **GET /api/clients/:clientId/documents** - List documents with optional filters (source, kind)

No download or presigned URL endpoints exist yet. When these are added in the future, audit logging can be implemented using the reserved action constants.

## Testing Instructions

### Manual Acceptance Test:

1. **Start the application:**
   ```bash
   npm run dev
   ```

2. **Authenticate and get a JWT token:**
   ```bash
   # Login or use existing token
   export TOKEN="your-jwt-token"
   export CLIENT_ID="your-client-id"
   ```

3. **Call the documents list endpoint:**
   ```bash
   curl -X GET "http://localhost:3000/api/clients/${CLIENT_ID}/documents?source=upload&kind=invoice" \
     -H "Authorization: Bearer ${TOKEN}" \
     -H "x-api-key: your-api-key"
   ```

4. **Verify audit log in database:**
   ```sql
   SELECT 
     id,
     client_id,
     actor_user_id,
     actor_role,
     action,
     entity_type,
     metadata,
     created_at
   FROM audit_logs
   WHERE action = 'DOCUMENTS_LIST_VIEWED'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

5. **Expected audit log entry:**
   - `action`: `DOCUMENTS_LIST_VIEWED`
   - `client_id`: Matches the client ID from the request
   - `actor_user_id`: User ID from JWT token
   - `actor_role`: User role from JWT token
   - `entity_type`: `document`
   - `metadata.query_params.source`: `upload`
   - `metadata.query_params.kind`: `invoice`
   - `metadata.result_count`: Number of documents returned
   - `metadata.ip`: Request IP address
   - `metadata.user_agent`: Request user agent string

## Security Considerations

- **Sensitive data sanitization**: The `auditLogService` automatically sanitizes sensitive fields (passwords, tokens, API keys, etc.) from metadata
- **Non-blocking logging**: Audit failures do not affect the main request flow
- **Safe metadata**: Only captures IP and user-agent which are already available in Express request headers
- **Actor tracking**: Uses authenticated user info from `req.user` which is validated by JWT middleware

## Future Enhancements

When document download or presigned URL endpoints are added:

1. Use `AuditActions.DOCUMENT_URL_CREATED` for presigned URL generation
2. Use `AuditActions.DOCUMENT_DOWNLOADED` for actual downloads
3. Include document ID in `entity_id` field
4. Add relevant metadata (document name, size, expiration time for URLs, etc.)

## Dependencies

- Requires Ticket 5 implementation (`auditLogService`)
- Requires `audit_logs` table in database
- Requires JWT authentication middleware (`req.user` populated)
