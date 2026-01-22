# External Storage Integration - Implementation Summary

## Overview
Added Google Drive and Microsoft 365 (SharePoint/OneDrive) external storage integration to the document management system. Documents are still stored in Supabase Storage as the source of truth, with external storage acting as an optional mirror.

## Database Changes

### Migration: `20260122_add_external_storage.sql`

**New Tables:**

1. **external_storage_connections**
   - Stores OAuth connections per client
   - Fields: provider, status, access_token, refresh_token, expires_at, root_folder_id
   - Unique constraint: (client_id, provider)
   - RLS policies for admin and client access

2. **external_upload_jobs**
   - Queue for async external uploads
   - Fields: document_id, provider, status, attempts, last_error
   - Unique constraint on document_id
   - Max 3 retry attempts

3. **client_settings** (created or extended)
   - documents_mirror_enabled: boolean
   - documents_mirror_provider: 'google_drive' | 'microsoft_graph'

**Documents Table Extensions:**
- external_provider
- external_file_id
- external_drive_id (for MS)
- external_web_url
- external_sync_status: 'pending' | 'synced' | 'failed'
- external_synced_at
- external_error

**Database Function:**
- `enqueue_external_upload_job(p_client_id, p_document_id, p_provider)` - Creates job with idempotency

## Code Structure

### New Modules

```
src/
├── types/
│   └── externalStorage.ts              # TypeScript types and interfaces
├── modules/
│   └── externalStorage/
│       ├── externalStorage.routes.ts   # OAuth & connection management endpoints
│       ├── externalStorageService.ts   # Core service logic
│       └── providers/
│           ├── googleDriveProvider.ts  # Google Drive API implementation
│           └── microsoftGraphProvider.ts # Microsoft Graph API implementation
└── jobs/
    └── processExternalUploads.ts       # Background job worker
```

### Key Components

**1. Provider Implementations**
- `GoogleDriveProvider`: Multipart upload to Google Drive
- `MicrosoftGraphProvider`: Simple upload (<4MB) or chunked session upload (>4MB)
- Both implement `IExternalStorageProvider` interface
- Automatic token refresh on 401 errors

**2. External Storage Service**
- Manages provider instances
- Handles token expiration and refresh
- Coordinates uploads with retry logic
- Checks mirror settings per client

**3. OAuth Flow**
- `GET /api/clients/:clientId/external-storage/:provider/auth-url` - Generate OAuth URL
- `GET /api/external-storage/callback/:provider` - Handle OAuth callback
- State parameter includes client_id + CSRF protection
- Tokens stored securely (never returned in API responses)

**4. Connection Management**
- `GET /api/clients/:clientId/external-storage` - List connections (tokens sanitized)
- `PATCH /api/clients/:clientId/external-storage/:provider` - Update root folder
- `DELETE /api/clients/:clientId/external-storage/:provider` - Revoke connection

**5. Document Upload Integration**
- Modified `documents.routes.ts` upload endpoint
- After successful upload, checks if mirroring is enabled
- Enqueues external upload job if configured
- Non-blocking - doesn't affect upload response time

**6. Job Worker**
- Runs every 30 seconds via cron
- Processes up to 10 jobs per batch
- Downloads file from Supabase Storage
- Uploads to external provider
- Updates document with external metadata
- Retries up to 3 times on failure
- Marks connection as 'error' if token refresh fails

## API Endpoints

### OAuth & Connections
```
GET    /api/clients/:clientId/external-storage/:provider/auth-url
GET    /api/external-storage/callback/:provider
GET    /api/clients/:clientId/external-storage
PATCH  /api/clients/:clientId/external-storage/:provider
DELETE /api/clients/:clientId/external-storage/:provider
```

### Providers
- `google_drive`
- `microsoft_graph`

## Configuration

### Environment Variables (.env.example updated)
```bash
# Google Drive OAuth
GOOGLE_DRIVE_CLIENT_ID=your_google_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_google_client_secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/external-storage/callback/google_drive

# Microsoft Graph OAuth
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/external-storage/callback/microsoft_graph
```

### Setup Steps
1. Create OAuth apps in Google Cloud Console and Azure Portal
2. Configure redirect URIs
3. Add credentials to `.env`
4. Run migration: `supabase db push`
5. Install dependencies: `npm install` (adds axios)

## Security

- **Token Encryption**: Access/refresh tokens encrypted at rest using AES-256-GCM
  - Encryption key: 32 bytes (64 hex chars) from `EXTERNAL_STORAGE_TOKEN_ENCRYPTION_KEY`
  - Format: `ivHex:authTagHex:cipherHex`
  - Decryption failures mark connection as 'error'
- **OAuth State Validation**: Signed JWT with 10-minute TTL
  - Payload: clientId, provider, nonce, iat, exp
  - Verified on callback with signature check
  - Rejects invalid, expired, or mismatched provider states
- **Authentication**: All client-scoped endpoints require JWT + API key
- **Client Isolation**: RLS policies ensure clients only access their own connections
- **Token Refresh**: Automatic refresh before expiration (5-minute buffer)
- **Error Handling**: Connection marked as 'error' on refresh failure
- **Route Separation**: Client-scoped routes protected, callback route public
- **Atomic Job Claims**: SKIP LOCKED prevents race conditions in job processing

## Audit Logging

New audit actions:
- `EXTERNAL_STORAGE_CONNECTED`
- `EXTERNAL_STORAGE_DISCONNECTED`
- `DOCUMENT_EXTERNAL_UPLOAD_ENQUEUED`
- `DOCUMENT_EXTERNAL_UPLOAD_SUCCEEDED`
- `DOCUMENT_EXTERNAL_UPLOAD_FAILED`

Metadata includes: provider, attempts, errors (sanitized), external file IDs

## Testing

### Test File: `tests/externalStorage.test.ts`

**Test Coverage:**
1. OAuth URL generation (Google Drive & Microsoft Graph)
2. Invalid provider rejection
3. Connection listing (with token sanitization)
4. Connection updates (root folder)
5. Connection revocation
6. Document upload WITHOUT mirroring (no job created)
7. Document upload WITH mirroring (job enqueued)
8. Job retry logic (max 3 attempts)
9. Revoked connection prevents new jobs

**Mocking:**
- External APIs (Google/Microsoft) are mocked via `vi.mock('axios')`
- Tests use real Supabase test database
- No actual external API calls

### Running Tests
```bash
npm test                                      # Run all tests
npm test -- tests/externalStorage.test.ts    # Run external storage tests only
npm test:watch                                # Watch mode
```

## Dependencies Added

- `axios@^1.6.5` - HTTP client for external API calls

## Migration Path

### For Existing Deployments
1. Run database migration
2. Update environment variables
3. Deploy new code
4. Enable jobs: `ENABLE_JOBS=true` or deploy to production
5. Configure OAuth apps in Google/Microsoft consoles
6. Test OAuth flow with a client

### Enabling for a Client
1. Client connects via OAuth flow (frontend redirects to auth URL)
2. Admin/client sets `documents_mirror_enabled=true` in client_settings
3. Admin/client sets `documents_mirror_provider` to desired provider
4. Future uploads automatically mirror to external storage

## Rollback Plan

If issues occur:
1. Set `documents_mirror_enabled=false` for affected clients
2. Stop processing jobs (set `ENABLE_JOBS=false`)
3. Existing documents remain in Supabase Storage (source of truth)
4. External storage data can be cleaned up manually if needed

## Purge Behavior

When a document is purged from the system:
- ✅ Document record deleted from database
- ✅ File deleted from Supabase Storage (source of truth)
- ❌ External file **NOT** deleted (remains as orphan in Google Drive/Microsoft 365)

**Rationale:**
- External storage is a mirror/backup, not managed storage
- Deleting from external providers is risky (token may be expired, connection revoked)
- Clients can manually clean up external files if needed
- Prevents accidental data loss if external provider is primary backup

**Future Enhancement:**
- Optional external cleanup on purge (with retry logic)
- Webhook notifications to external providers
- Bulk cleanup tools for orphaned files

## Limitations & Future Enhancements

**Current Limitations:**
- One provider per client (can't mirror to both simultaneously)
- No bidirectional sync (external → internal)
- No conflict resolution
- No bulk retry mechanism for failed jobs

**Potential Enhancements:**
- Support multiple providers per client
- Import documents from external storage
- Webhook support for external changes
- Admin dashboard for job monitoring
- Bulk retry/cleanup tools
- Configurable retry strategy per provider

## Performance Considerations

- Job worker processes 10 jobs per batch (30-second intervals)
- Large files (>4MB) use chunked uploads for Microsoft Graph
- Token refresh happens automatically before expiration
- Failed jobs don't block other jobs
- Non-blocking integration - upload response time unchanged

## Monitoring

**Key Metrics to Monitor:**
- Job success/failure rates
- Average retry attempts
- Token refresh failures
- Connection status distribution
- Upload latency to external providers

**Database Queries:**
```sql
-- Failed jobs needing attention
SELECT * FROM external_upload_jobs 
WHERE status = 'failed' AND attempts >= 3;

-- Connection health
SELECT provider, status, COUNT(*) 
FROM external_storage_connections 
GROUP BY provider, status;

-- Recent upload activity
SELECT provider, status, COUNT(*) 
FROM external_upload_jobs 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY provider, status;
```

## Files Changed/Created

### Created
- `supabase/migrations/20260122_add_external_storage.sql`
- `src/types/externalStorage.ts`
- `src/modules/externalStorage/externalStorage.routes.ts`
- `src/modules/externalStorage/externalStorageService.ts`
- `src/modules/externalStorage/providers/googleDriveProvider.ts`
- `src/modules/externalStorage/providers/microsoftGraphProvider.ts`
- `src/jobs/processExternalUploads.ts`
- `tests/externalStorage.test.ts`
- `EXTERNAL_STORAGE_IMPLEMENTATION.md`

### Modified
- `src/config/env.ts` - Added OAuth config
- `src/constants/auditActions.ts` - Added external storage actions
- `src/modules/documents/documents.routes.ts` - Added mirroring logic
- `src/jobs/index.ts` - Registered external upload job
- `src/app.ts` - Registered external storage routes
- `package.json` - Added axios dependency
- `.env.example` - Added OAuth environment variables

## Summary

The external storage integration is production-ready with:
- ✅ Secure OAuth flow
- ✅ Token management with auto-refresh
- ✅ Async job processing with retry logic
- ✅ Comprehensive error handling
- ✅ Audit logging
- ✅ Test coverage
- ✅ Minimal impact on existing functionality
- ✅ Source of truth remains in Supabase Storage

All non-negotiables met:
- ✅ Internal storage remains source of truth
- ✅ External storage is optional mirror
- ✅ Minimal refactor (follows existing patterns)
- ✅ Secure token storage
- ✅ Tenant isolation
- ✅ Tests included
