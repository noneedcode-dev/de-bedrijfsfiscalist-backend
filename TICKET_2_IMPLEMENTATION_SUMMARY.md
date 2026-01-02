# TICKET 2: Standardize Auth Errors + JWT Claim Validation

## Implementation Summary

All authentication-related errors now return standardized error format with consistent codes. JWT claim validation enforces required claims (sub, role, client_id) before setting `req.user`.

---

## Changes Made

### 1. Error Codes (`src/constants/errorCodes.ts`)

**Added:**
- `AUTH_INVALID_CLAIMS` - Token is missing required claims (401)

**Existing codes now properly used:**
- `AUTH_MISSING_HEADER` (401) - Authorization header missing
- `AUTH_INVALID_FORMAT` (401) - Authorization header not "Bearer <token>"
- `AUTH_INVALID_TOKEN` (401) - Invalid/expired token
- `AUTH_USER_NOT_FOUND` (404) - Valid token but user record missing
- `AUTH_INSUFFICIENT_PERMISSIONS` (403) - Role mismatch (non-admin calling admin route)

### 2. AuthUser Interface (`src/types/express.d.ts`)

**Updated JWT claim schema:**
```typescript
export interface AuthUser {
  sub: string;                // Required: user ID
  role: 'admin' | 'client';   // Required: user role
  client_id: string;          // Required: client ID (enforced for client role)
  permissions?: string[];     // Optional: permissions array
  scopes?: string[];          // Optional: scopes array
  accessToken?: string;       // Optional: JWT token for user-scoped operations
}
```

### 3. Authentication Middleware (`src/modules/auth/auth.middleware.ts`)

**Enhanced `authenticateJWT` with claim validation:**

1. **Missing Authorization header** → `AUTH_MISSING_HEADER` (401)
2. **Invalid header format** (not "Bearer <token>") → `AUTH_INVALID_FORMAT` (401)
3. **Invalid/expired token** → `AUTH_INVALID_TOKEN` (401)
4. **Missing required claims** (sub or role) → `AUTH_INVALID_CLAIMS` (401)
   - Returns details: `{ missing_claims: ['sub', 'role'] }`
5. **Client role missing client_id** → `AUTH_INVALID_CLAIMS` (401)
   - Returns details: `{ missing_claims: ['client_id'], reason: 'client_id is required for client role' }`
6. **User not found in database** → `AUTH_USER_NOT_FOUND` (404)

**Updated `requireRole` middleware:**
- User not authenticated → `AUTH_MISSING_HEADER` (401)
- Insufficient permissions → `AUTH_INSUFFICIENT_PERMISSIONS` (403)

**Updated `optionalAuth` middleware:**
- Applies same claim validation logic
- Silently skips invalid claims (doesn't fail request)

### 4. Client Access Middleware (`src/middleware/clientAccess.ts`)

**Standardized errors:**
- User not authenticated → `AUTH_MISSING_HEADER` (401)
- Client accessing wrong client_id → `CLIENT_ACCESS_DENIED` (403)

### 5. Auth Routes (`src/modules/auth/auth.routes.ts`)

**Standardized invitation errors:**
- Invalid token → `INVITE_INVALID_TOKEN` (404)
- Expired invitation → `INVITE_EXPIRED` (410)
- Already accepted → `INVITE_ALREADY_ACCEPTED` (400)
- Cancelled invitation → `INVITE_CANCELLED` (400)
- Missing client_id → `INVITE_CREATE_FAILED` (500)
- User not found → `AUTH_USER_NOT_FOUND` (404)
- Password update failed → `USER_UPDATE_FAILED` (500)

---

## Error Response Format

All auth errors follow the standardized format from Ticket 1:

```json
{
  "code": "AUTH_INVALID_CLAIMS",
  "message": "Token is missing required claims",
  "details": {
    "missing_claims": ["client_id"],
    "reason": "client_id is required for client role"
  },
  "request_id": "req_abc123",
  "timestamp": "2025-12-31T00:24:00.000Z"
}
```

---

## Manual Acceptance Tests

### Test 1: Missing Authorization Header
```bash
curl -X GET http://localhost:3000/api/admin/users
```
**Expected:** 401 with `AUTH_MISSING_HEADER`

### Test 2: Invalid Authorization Format
```bash
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: token xxx"
```
**Expected:** 401 with `AUTH_INVALID_FORMAT`

### Test 3: Expired/Invalid Token
```bash
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer invalid_token_here"
```
**Expected:** 401 with `AUTH_INVALID_TOKEN`

### Test 4: Token Missing client_id (for client role)
This would require a specially crafted token or database manipulation where a client user has null client_id.
**Expected:** 401 with `AUTH_INVALID_CLAIMS` and details showing `missing_claims: ['client_id']`

### Test 5: Admin Role Check
```bash
# As client user, try to access admin endpoint
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer <client_token>"
```
**Expected:** 403 with `AUTH_INSUFFICIENT_PERMISSIONS`

### Test 6: Valid Token, User Not Found
This would occur if token is valid but user was deleted from app_users table.
**Expected:** 404 with `AUTH_USER_NOT_FOUND`

---

## Security Considerations

✅ **No security weakened** - All validations are strict
✅ **Required claims enforced** - Missing any required claim → deny
✅ **Admin logic explicit** - `role === 'admin'` checks throughout
✅ **Client isolation** - Clients can only access their own client_id
✅ **Centralized error handling** - All errors bubble through errorHandler middleware

---

## Files Changed

1. `src/constants/errorCodes.ts` - Added AUTH_INVALID_CLAIMS
2. `src/types/express.d.ts` - Updated AuthUser interface with permissions/scopes
3. `src/modules/auth/auth.middleware.ts` - Added JWT claim validation
4. `src/middleware/clientAccess.ts` - Standardized error codes
5. `src/modules/auth/auth.routes.ts` - Standardized invitation error codes

---

## Backward Compatibility

✅ Successful responses unchanged
✅ Error response structure consistent with Ticket 1
✅ HTTP status codes remain the same
✅ Only error codes and messages standardized
