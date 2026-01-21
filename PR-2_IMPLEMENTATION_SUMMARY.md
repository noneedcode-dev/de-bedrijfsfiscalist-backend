# PR-2: Document Upload with Idempotency - Implementation Summary

## Overview
Implemented POST `/api/clients/:clientId/documents/upload` endpoint with strict idempotency support using `Idempotency-Key` header.

## ✅ Checklist - All Requirements Met

- ✅ Add POST `/api/clients/:clientId/documents/upload` (multipart, field: file)
- ✅ Require `Idempotency-Key` header (422 if missing) and treat it as `upload_session_id`
- ✅ Idempotent: same (client_id, upload_session_id) returns existing doc (200)
- ✅ Upload to Supabase Storage bucket: `documents` (private)
- ✅ DB insert includes: `original_filename`, `storage_key`, `mime_type`, `size`, `created_by`, `upload_session_id`
- ✅ If storage upload fails: best-effort DB cleanup
- ✅ Add audit action: `DOCUMENT_UPLOADED`
- ✅ Tests: idempotency, missing key, missing file, client access violation
- ✅ Minimal file changes (only 6 files modified)

## Files Changed

### 1. Database Migration
**File:** `supabase/migrations/20260121_add_document_upload_session.sql` (NEW)
- Added `upload_session_id` column to `documents` table
- Created unique index on `(client_id, upload_session_id)` for idempotency enforcement
- Added index for querying by `upload_session_id`

### 2. Database Types
**File:** `src/types/database.ts`
- Added `upload_session_id: string | null` to `DbDocument` interface

### 3. Audit Actions
**File:** `src/constants/auditActions.ts`
- Added `DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED'` to `AuditActions`

### 4. Environment Configuration
**File:** `src/config/env.ts`
- Added `documents.maxSizeMB` configuration (default: 10MB)
- Reads from `DOCUMENTS_MAX_SIZE_MB` environment variable

### 5. Documents Routes (Main Implementation)
**File:** `src/modules/documents/documents.routes.ts`
- Added imports: `multer`, `crypto`, `header` validator, `createSupabaseAdminClient`, `DbDocument`
- Configured multer for memory storage with size limits
- Implemented POST `/upload` endpoint with:
  - Multipart file upload (field name: `file`)
  - `Idempotency-Key` header validation
  - Idempotency check: returns 200 if document already exists
  - File validation: returns 422 if file is missing
  - Storage key format: `clients/{clientId}/documents/{docId}/{safe_filename}`
  - DB insert with all required fields
  - Supabase Storage upload to `documents` bucket
  - Best-effort cleanup on storage failure
  - Audit logging with `DOCUMENT_UPLOADED` action

### 6. Tests
**File:** `tests/documentUpload.test.ts` (NEW)
- **10 comprehensive tests covering:**
  1. ✅ Missing `Idempotency-Key` header → 422
  2. ✅ Empty `Idempotency-Key` header → 422
  3. ✅ Missing file → 422
  4. ✅ Client access violation → 403
  5. ✅ Idempotency: same key twice → 200 with existing document
  6. ✅ Different idempotency keys → different documents
  7. ✅ Successful upload with all required fields → 201
  8. ✅ Admin can upload for any client → 201
  9. ✅ Storage cleanup on failure → 500
  10. ✅ Standard error format for validation errors

## Implementation Details

### Upload Flow
1. **Validate** `Idempotency-Key` header and file presence
2. **Check** for existing document by `(client_id, upload_session_id)`
3. **If exists:** Return 200 with existing document (idempotent)
4. **If new:** 
   - Generate UUID for document
   - Insert DB row with all metadata
   - Upload file to Supabase Storage
   - If upload fails: best-effort delete DB row
   - Log audit event
   - Return 201 with new document

### Storage Key Format
```
clients/{clientId}/documents/{docId}/{safe_filename}
```

### Idempotency Mechanism
- Uses `Idempotency-Key` header as `upload_session_id`
- Database unique constraint on `(client_id, upload_session_id)` enforces uniqueness
- Query checks for existing document before upload
- Returns existing document with 200 status if found

### Error Handling
- **422**: Missing `Idempotency-Key` or file
- **403**: Client access denied (tenant isolation)
- **500**: Storage upload failure (with cleanup)
- All errors follow standard error response format

## Testing

### Run Tests
```bash
# Run only document upload tests
npm test -- documentUpload.test.ts

# Run all tests
npm test
```

### Test Results
- ✅ All 10 PR-2 tests pass
- ✅ All 306 existing tests still pass
- ✅ No linter errors

## Database Schema Changes

```sql
-- Add upload_session_id column
ALTER TABLE public.documents 
ADD COLUMN upload_session_id TEXT;

-- Unique constraint for idempotency
CREATE UNIQUE INDEX documents_client_upload_session_unique 
ON public.documents (client_id, upload_session_id) 
WHERE upload_session_id IS NOT NULL;

-- Index for queries
CREATE INDEX idx_documents_upload_session 
ON public.documents (upload_session_id) 
WHERE upload_session_id IS NOT NULL;
```

## API Usage Example

### Upload a Document
```bash
curl -X POST \
  http://localhost:3000/api/clients/{clientId}/documents/upload \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Idempotency-Key: unique-session-id-123" \
  -F "file=@document.pdf"
```

### Response (201 Created)
```json
{
  "data": {
    "id": "doc-uuid",
    "client_id": "client-uuid",
    "uploaded_by": "user-uuid",
    "source": "s3",
    "kind": "client_upload",
    "name": "document.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 12345,
    "storage_path": "clients/{clientId}/documents/{docId}/document.pdf",
    "upload_session_id": "unique-session-id-123",
    "created_at": "2026-01-21T18:00:00.000Z"
  }
}
```

### Idempotent Response (200 OK - Same Idempotency-Key)
```json
{
  "data": { /* same document as above */ },
  "message": "Document already uploaded"
}
```

## Environment Variables

Add to `.env`:
```env
# Optional: Maximum document size in MB (default: 10)
DOCUMENTS_MAX_SIZE_MB=10
```

## Security & Best Practices

1. ✅ **Tenant Isolation**: `validateClientAccess` middleware enforces client boundaries
2. ✅ **Authentication**: JWT required via `authenticateJWT` middleware
3. ✅ **File Size Limit**: Configurable via environment variable
4. ✅ **Safe Filenames**: Special characters sanitized
5. ✅ **Private Storage**: Uses Supabase Storage with admin client for RLS bypass
6. ✅ **Audit Logging**: All uploads logged with metadata
7. ✅ **Idempotency**: Prevents duplicate uploads with unique constraint
8. ✅ **Error Recovery**: Best-effort cleanup on storage failure

## Migration Path

1. **Apply migration**: Run `20260121_add_document_upload_session.sql`
2. **Deploy code**: No breaking changes to existing endpoints
3. **Test endpoint**: Use provided curl examples
4. **Existing documents**: `upload_session_id` will be NULL (allowed)

## Notes

- Existing documents table already had most required fields
- Only added `upload_session_id` column for idempotency
- Field name mapping:
  - `original_filename` → `name` (existing field)
  - `storage_key` → `storage_path` (existing field)
  - `size` → `size_bytes` (existing field)
  - `created_by` → `uploaded_by` (existing field)
- Storage uses Supabase Storage (S3-compatible) marked as `source: 's3'`
- Documents are marked as `kind: 'client_upload'`

## Compliance with Non-Negotiables

✅ Follows existing repo patterns for routing, error responses, middleware usage  
✅ Tests remain GREEN (all 306 existing + 10 new tests pass)  
✅ Uses multer for multipart upload (field name: "file")  
✅ Enforces max size via `DOCUMENTS_MAX_SIZE_MB` env variable  
✅ Minimal file changes (6 files total)  
✅ No refactoring of unrelated code  
✅ Standard error response format maintained  
✅ Audit logging implemented  
✅ Client access validation enforced  

---

**Implementation Status:** ✅ COMPLETE  
**Tests:** ✅ 10/10 passing  
**Linter:** ✅ No errors  
**Overall Tests:** ✅ 306/306 passing (+ 10 new)
