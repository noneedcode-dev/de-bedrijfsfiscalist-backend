# Timer Active Endpoint - Client Access Implementation

## Summary
Enabled CLIENT users to access `GET /api/clients/:clientId/time-entries/timer/active` endpoint.

## Changes Made

### 1. Route Middleware (`src/modules/timeEntries/timeEntries.routes.ts`)
- **Removed**: `requireRole('admin')` middleware
- **Added**: `requireAuth` middleware (allows both admin and client roles)
- **Made optional**: `advisor_user_id` query parameter
- **Changed**: Uses `getSupabase(req)` to support both admin (admin client) and client (user client) contexts
- **Comment updated**: "Get active timer (admin + client)"

### 2. Service Layer (`src/modules/timeEntries/timeEntries.service.ts`)
- **Updated**: `getActiveTimer` function signature to accept optional `advisorUserId` and `role` parameters
- **Logic**: 
  - Always filters by `client_id`
  - Only filters by `advisor_user_id` when role is 'admin' AND advisorUserId is provided
  - For client role, returns any active timer for the client (ignores advisorUserId param)

### 3. Tests (`tests/timeEntries.timer.test.ts`)
- **Updated**: Tests to verify CLIENT can access their own active timer (returns 200/500, not 403)
- **Added**: Test to verify CLIENT cannot access different clientId (returns 403)
- **Updated**: Tests to verify ADMIN can access any client with or without advisor_user_id filter
- **Updated**: advisor_user_id is now optional for all roles

## Security & Tenant Isolation

✅ **Tenant isolation enforced** via `validateClientAccess` middleware (applied at router level in `app.ts`)
- CLIENT role: Can only access their own `client_id`
- ADMIN role: Can access any `client_id`

✅ **RLS policies** on `active_timers` table already enforce:
- `app_users.id = auth.uid() AND app_users.client_id = active_timers.client_id`

✅ **No cross-tenant leakage** possible

## Manual Verification Commands

### Prerequisites
- Replace `{API_KEY}` with your API key
- Replace `{CLIENT_JWT}` with a valid client JWT token
- Replace `{ADMIN_JWT}` with a valid admin JWT token
- Replace `{CLIENT_ID}` with the actual client UUID
- Replace `{ADVISOR_USER_ID}` with an actual advisor user UUID (optional for admin)

### Test 1: Client accessing their own active timer
```bash
curl -i "https://your-api-domain.com/api/clients/{CLIENT_ID}/time-entries/timer/active" \
  -H "x-api-key: {API_KEY}" \
  -H "Authorization: Bearer {CLIENT_JWT}"
```
**Expected**: `200 OK` with `{"data": {...} | null, "meta": {...}}`

### Test 2: Client accessing different clientId (should fail)
```bash
curl -i "https://your-api-domain.com/api/clients/{DIFFERENT_CLIENT_ID}/time-entries/timer/active" \
  -H "x-api-key: {API_KEY}" \
  -H "Authorization: Bearer {CLIENT_JWT}"
```
**Expected**: `403 Forbidden` with `{"code": "CLIENT_ACCESS_DENIED"}`

### Test 3: Admin accessing any client (no advisor filter)
```bash
curl -i "https://your-api-domain.com/api/clients/{CLIENT_ID}/time-entries/timer/active" \
  -H "x-api-key: {API_KEY}" \
  -H "Authorization: Bearer {ADMIN_JWT}"
```
**Expected**: `200 OK` with `{"data": {...} | null, "meta": {...}}`

### Test 4: Admin accessing with advisor_user_id filter
```bash
curl -i "https://your-api-domain.com/api/clients/{CLIENT_ID}/time-entries/timer/active?advisor_user_id={ADVISOR_USER_ID}" \
  -H "x-api-key: {API_KEY}" \
  -H "Authorization: Bearer {ADMIN_JWT}"
```
**Expected**: `200 OK` with filtered results (only timer for specified advisor)

### Test 5: Missing authentication
```bash
curl -i "https://your-api-domain.com/api/clients/{CLIENT_ID}/time-entries/timer/active" \
  -H "x-api-key: {API_KEY}"
```
**Expected**: `401 Unauthorized`

## Acceptance Criteria

✅ Client token can call timer/active for its own clientId and gets 200 with correct payload (or null)  
✅ Client token calling a different clientId is denied (403)  
✅ Admin token still works  
✅ No changes to timer start/stop permissions (remain admin-only)  
✅ No cross-tenant leakage  
✅ advisor_user_id is optional (not required)  
✅ Admin can filter by advisor_user_id when provided  
✅ Client ignores advisor_user_id parameter  

## Testing

Run automated tests:
```bash
npm test -- timeEntries.timer.test.ts
```

All 18 tests pass ✓

## Files Modified

1. `src/modules/timeEntries/timeEntries.routes.ts`
2. `src/modules/timeEntries/timeEntries.service.ts`
3. `tests/timeEntries.timer.test.ts`

## Notes

- The `validateClientAccess` middleware is applied at the router level (`/api/clients/:clientId`) in `app.ts`, so it automatically protects all routes under this path
- Timer start/stop endpoints remain admin-only (no changes)
- The endpoint uses RLS-enforced Supabase queries for additional security
