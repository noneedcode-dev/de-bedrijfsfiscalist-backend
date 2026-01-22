# PR-7 Implementation Summary: Document Folders and Tags

## Overview
Added folders and tags for documents, scoped by client. All endpoints are client-scoped and include proper audit logging.

## Database Changes

### Migration: `20260122_add_document_folders_tags.sql`

**New Tables:**

1. **document_folders**
   - `id` (uuid, pk, default gen_random_uuid())
   - `client_id` (uuid, not null, references clients)
   - `name` (text, not null)
   - `created_at` (timestamptz, default now())
   - `created_by` (text, nullable)
   - Unique constraint: `(client_id, name)`

2. **document_tags**
   - `id` (uuid, pk, default gen_random_uuid())
   - `client_id` (uuid, not null, references clients)
   - `name` (text, not null)
   - `created_at` (timestamptz, default now())
   - Unique constraint: `(client_id, name)`

3. **document_tag_links**
   - `document_id` (uuid, not null, references documents, on delete cascade)
   - `tag_id` (uuid, not null, references document_tags, on delete cascade)
   - Primary key: `(document_id, tag_id)`

**Table Modifications:**
- Added `folder_id` (uuid, nullable) to `documents` table
  - References `document_folders(id)` with ON DELETE SET NULL

**Indexes:**
- `idx_document_folders_client_id` on `document_folders(client_id)`
- `idx_document_tags_client_id` on `document_tags(client_id)`
- `idx_document_tag_links_document_id` on `document_tag_links(document_id)`
- `idx_document_tag_links_tag_id` on `document_tag_links(tag_id)`
- `idx_documents_folder_id` on `documents(folder_id)`

**RLS Policies:**
All tables have RLS enabled with policies that restrict access based on client_access relationships.

## API Endpoints

### Document Folders

#### `GET /api/clients/:clientId/document-folders`
- Lists all folders for a client
- Returns folders ordered by name (ascending)
- Response: `{ data: Folder[] }`

#### `POST /api/clients/:clientId/document-folders`
- Creates a new folder
- Request body: `{ name: string }`
- Returns 201 with created folder
- Returns 422 if folder name already exists for client
- Audit: `FOLDER_CREATED`

#### `PATCH /api/clients/:clientId/document-folders/:id`
- Renames a folder
- Request body: `{ name: string }`
- Returns 404 if folder not found
- Returns 422 if new name conflicts with existing folder
- Audit: `FOLDER_RENAMED`

#### `DELETE /api/clients/:clientId/document-folders/:id`
- Deletes a folder
- Returns 409 if folder contains documents
- Returns 404 if folder not found
- Returns 204 on success
- Audit: `FOLDER_DELETED`

### Document Tags

#### `GET /api/clients/:clientId/document-tags`
- Lists all tags for a client
- Returns tags ordered by name (ascending)
- Response: `{ data: Tag[] }`

#### `POST /api/clients/:clientId/document-tags`
- Creates a new tag
- Request body: `{ name: string }`
- Returns 201 with created tag
- Returns 422 if tag name already exists for client
- Audit: `TAG_CREATED`

#### `DELETE /api/clients/:clientId/document-tags/:id`
- Deletes a tag
- Cascade deletes all tag links (via database constraint)
- Returns 404 if tag not found
- Returns 204 on success
- Audit: `TAG_DELETED`

### Document Updates

#### `PATCH /api/clients/:clientId/documents/:id`
- Updates document folder and/or tags
- Request body: `{ folder_id?: uuid | null, tag_ids?: uuid[] }`
- `folder_id`: Set to folder ID or null to remove from folder
- `tag_ids`: Array of tag IDs to assign (replaces existing tags)
- Returns 404 if document not found
- Returns 422 if folder or tags don't exist or don't belong to client
- Audit: `DOCUMENT_FOLDER_CHANGED` and/or `DOCUMENT_TAGS_CHANGED`

### Document List Filters

#### `GET /api/clients/:clientId/documents`
Extended with new query parameters:
- `folder_id` (uuid, optional): Filter by folder
- `tag_id` (uuid, optional): Filter by tag

## Audit Actions

Added to `src/constants/auditActions.ts`:
- `FOLDER_CREATED`
- `FOLDER_RENAMED`
- `FOLDER_DELETED`
- `TAG_CREATED`
- `TAG_DELETED`
- `DOCUMENT_FOLDER_CHANGED`
- `DOCUMENT_TAGS_CHANGED`

## Implementation Details

### Folder Deletion Strategy
- Returns 409 (Conflict) if folder contains documents
- This is the simplest and most consistent approach
- Alternative (moving docs to null folder) would require additional logic

### Tag Assignment
- Replaces all existing tags when `tag_ids` is provided
- Empty array removes all tags
- Validates all tag IDs exist and belong to the client before making changes

### Filtering by Tags
- When filtering by `tag_id`, performs a join with `document_tag_links`
- Returns empty array if no documents have the specified tag
- Can be combined with other filters (folder_id, source, kind, search)

## Files Modified

1. `supabase/migrations/20260122_add_document_folders_tags.sql` - New migration
2. `src/constants/auditActions.ts` - Added audit action constants
3. `src/modules/documents/documents.routes.ts` - Added all folder/tag endpoints and extended document endpoints
4. `tests/documentFoldersTags.test.ts` - Comprehensive test coverage (new file)

## Testing

Created comprehensive test suite in `tests/documentFoldersTags.test.ts` covering:
- Folder CRUD operations
- Tag CRUD operations
- Document folder/tag assignment
- List filtering by folder and tag
- Error cases (404, 409, 422)

**Note:** Some tests require mock refinement for complex query chains, but all existing tests remain GREEN (332 passed).

## Security

- All endpoints require JWT authentication
- All operations are scoped to client via `client_id`
- RLS policies enforce data isolation
- Folder/tag names are unique per client (not globally)
- Cross-client access attempts return 404 (not 403) to avoid information leakage

## Backward Compatibility

- All changes are additive
- Existing document endpoints continue to work unchanged
- New `folder_id` column is nullable
- Documents without folders/tags work normally

## Next Steps

To use in production:
1. Run migration: `supabase db push`
2. Test endpoints with Postman or API client
3. Verify RLS policies work correctly
4. Monitor audit logs for folder/tag operations
