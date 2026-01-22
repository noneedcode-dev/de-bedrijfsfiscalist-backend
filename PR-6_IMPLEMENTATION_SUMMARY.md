# PR-6 Implementation Summary: Document Soft-Delete (Archive) with Storage Cleanup

## Overview
Implemented soft-delete (archive) functionality for documents with safe storage cleanup option. Documents can be archived (soft-deleted) by any authenticated user with access, and permanently purged (hard-deleted) by admins only.

## Database Changes

### Migration: `20260122_add_document_soft_delete.sql`
Added soft-delete columns to `public.documents` table:
- `deleted_at` (timestamptz null): Timestamp when document was archived
- `deleted_by` (text null): User ID (sub) who deleted the document
- Index: `idx_documents_client_deleted` on `(client_id, deleted_at)` for efficient filtering

### Type Updates
Updated `DbDocument` interface in `src/types/database.ts`:
- Added `deleted_at: string | null`
- Added `deleted_by: string | null`
- Added `upload_session_id?: string | null` (existing field that was missing)

## API Endpoints

### 1. DELETE `/api/clients/:clientId/documents/:id` - Soft Delete (Archive)
**Authorization**: `authenticateJWT` + `validateClientAccess`

**Behavior**:
- Sets `deleted_at = now()` and `deleted_by = req.user.sub`
- Returns `204 No Content` on success
- **Idempotent**: Returns `204` if document is already deleted
- Returns `404` if document not found for client
- Returns `403` if client tries to delete another client's document

**Audit**: Logs `DOCUMENT_ARCHIVED` action

### 2. POST `/api/clients/:clientId/documents/:id/purge` - Hard Delete (Purge)
**Authorization**: `authenticateJWT` + `validateClientAccess` + **admin-only**

**Behavior**:
- Deletes storage objects first (best-effort to avoid orphaned DB rows):
  - Original file (`storage_path`)
  - Preview file (`preview_storage_key` - placeholder for PR-8)
- Deletes database row
- Returns `204 No Content` on success
- Returns `404` if document not found
- Returns `403` if non-admin attempts to purge
- Returns `500` if DB delete fails after storage deletion
- **Graceful degradation**: Succeeds even if storage deletion fails (logs warning)

**Audit**: Logs `DOCUMENT_PURGED` action with storage error details if applicable

## List/Get Endpoint Updates

### Modified Endpoints to Exclude Deleted Documents
1. **GET `/api/clients/:clientId/documents`** - List documents
   - Added filter: `.is('deleted_at', null)`
   - Only returns active (non-deleted) documents by default

2. **GET `/api/clients/:clientId/documents/:id/download`** - Download document
   - Added filter: `.is('deleted_at', null)`
   - Returns `404` if document is deleted (prevents downloading archived documents)

## Audit Actions

Added to `src/constants/auditActions.ts`:
- `DOCUMENT_ARCHIVED`: Logged when document is soft-deleted
- `DOCUMENT_PURGED`: Logged when document is permanently deleted

## Tests

### New Test File: `tests/documentSoftDelete.test.ts`
**15 comprehensive tests covering**:

#### DELETE Soft-Delete Tests (6 tests)
- ✅ Soft-delete a document successfully
- ✅ Idempotent behavior (204 when deleting already deleted document)
- ✅ 404 when document does not exist
- ✅ 403 when client tries to delete another client's document
- ✅ Admin can soft-delete any client's document
- ✅ 422 validation error for invalid UUID

#### POST Purge Tests (6 tests)
- ✅ Admin can purge document successfully (removes storage + DB)
- ✅ 403 when non-admin tries to purge
- ✅ 404 when document does not exist
- ✅ 500 when DB delete fails after storage deletion
- ✅ Success even when storage deletion fails (graceful degradation)
- ✅ 422 validation error for invalid UUID

#### List/Get Integration Tests (3 tests)
- ✅ List endpoint excludes soft-deleted documents
- ✅ Download endpoint returns 404 for soft-deleted documents
- ✅ Download endpoint works for active documents

### Updated Existing Test Files
Fixed mock query builders to support `.is()` method:
- `tests/documentUpload.test.ts` - All 26 tests passing
- `tests/clientAccess.test.ts` - All tests passing

## Test Results
```
✅ All tests passing: 328 passed | 91 skipped (419 total)
✅ New PR-6 tests: 15/15 passing
✅ Existing document tests: 26/26 passing
✅ No regressions introduced
```

## Key Design Decisions

### 1. Soft-Delete by Default
- Regular DELETE endpoint performs soft-delete (archive)
- Preserves data for recovery and audit purposes
- Storage files remain intact until purge

### 2. Admin-Only Hard Delete
- Only admins can permanently purge documents
- Prevents accidental data loss by regular users
- Provides additional safety layer

### 3. Storage-First Deletion Strategy
- Purge deletes storage objects before DB row
- Minimizes risk of orphaned DB rows pointing to deleted storage
- Graceful degradation if storage deletion fails

### 4. Idempotent Operations
- Soft-delete returns 204 even if already deleted
- Consistent with REST best practices
- Prevents errors in retry scenarios

### 5. Automatic Filtering
- List and download endpoints automatically exclude deleted documents
- No `include_deleted` parameter implemented (can be added in future if needed)
- Simplifies client implementation

## Error Handling

### Soft-Delete Errors
- `404`: Document not found for client
- `403`: Cross-client access denied
- `422`: Invalid UUID format
- `500`: Database update failure

### Purge Errors
- `404`: Document not found
- `403`: Non-admin user or cross-client access
- `422`: Invalid UUID format
- `500`: Database deletion failure (includes storage error details)

## Security Considerations

1. **Authorization**: Both endpoints use `validateClientAccess` middleware
2. **Tenant Isolation**: Clients can only delete their own documents (admins can access all)
3. **Admin-Only Purge**: Hard delete restricted to admin role
4. **Audit Trail**: All deletions logged with actor information
5. **Idempotent Design**: Safe for retries without side effects

## Future Enhancements (Not in PR-6)

1. **Include Deleted Parameter**: Add `?include_deleted=true` query param to list endpoint
2. **Restore Endpoint**: POST `/documents/:id/restore` to undelete archived documents
3. **Bulk Operations**: Bulk archive/purge endpoints
4. **Scheduled Cleanup**: Cron job to auto-purge documents deleted > N days ago
5. **Preview Storage Cleanup**: Full integration with PR-8 preview storage keys

## Files Modified

### New Files
- `supabase/migrations/20260122_add_document_soft_delete.sql`
- `tests/documentSoftDelete.test.ts`
- `PR-6_IMPLEMENTATION_SUMMARY.md`

### Modified Files
- `src/types/database.ts` - Added deleted_at, deleted_by, upload_session_id
- `src/constants/auditActions.ts` - Added DOCUMENT_ARCHIVED, DOCUMENT_PURGED
- `src/modules/documents/documents.routes.ts` - Added DELETE and POST purge endpoints, updated list/get filters
- `tests/documentUpload.test.ts` - Added .is() to mock query builder
- `tests/clientAccess.test.ts` - Added .is() to mock query builder

## Migration Instructions

1. Run migration: `supabase migration up`
2. Verify columns added: `deleted_at`, `deleted_by`
3. Verify index created: `idx_documents_client_deleted`
4. Deploy backend changes
5. Test soft-delete and purge endpoints
6. Monitor audit logs for DOCUMENT_ARCHIVED and DOCUMENT_PURGED actions

## Compatibility

- ✅ Backward compatible: Existing documents have `deleted_at = null`
- ✅ No breaking changes to existing endpoints
- ✅ All existing tests pass without modification (except mock updates)
- ✅ RLS policies unchanged (admin client used for writes)

## Status: ✅ COMPLETE

All requirements met:
- ✅ Database columns added with index
- ✅ Soft-delete endpoint (DELETE) implemented
- ✅ Hard-delete endpoint (POST purge) with storage cleanup
- ✅ List/get endpoints exclude deleted documents
- ✅ Audit actions added
- ✅ Comprehensive tests (15 new tests, all passing)
- ✅ No test regressions (328 total tests passing)
- ✅ Error handling consistent with existing patterns
- ✅ Admin-only purge enforced
- ✅ Idempotent operations
- ✅ Cross-client access blocked
