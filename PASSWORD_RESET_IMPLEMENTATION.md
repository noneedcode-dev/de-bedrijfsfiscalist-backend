# Password Reset Implementation Summary

## Overview
Implemented a custom password reset flow that does NOT send emails from the backend. The backend generates secure tokens and returns them in the API response. Bubble.io will handle sending the email with the reset link.

**Reset Link Format for Bubble:**
```
https://admin-85091.bubbleapps.io/version-test/reset-password?token={TOKEN}
```

---

## Implementation Details

### A) Database Migration
**File:** `supabase/migrations/20250106_add_password_reset_tokens.sql`

Created `password_reset_tokens` table with:
- `id` (uuid, primary key)
- `email` (text, not null)
- `token_hash` (text, not null) - SHA-256 hash of raw token
- `expires_at` (timestamptz, not null)
- `used_at` (timestamptz, nullable)
- `created_at` (timestamptz, not null)

**Indexes:**
- `password_reset_tokens_email_idx`
- `password_reset_tokens_token_hash_idx`
- `password_reset_tokens_expires_at_idx`

**Security:**
- RLS enabled with service-only policy (users cannot directly access)
- Only token hashes stored (raw tokens never persisted)
- Cleanup function `cleanup_password_reset_tokens()` for maintenance

---

### B) Backend Routes

#### 1. POST `/api/auth/password-reset/request`
**Purpose:** Generate and return a password reset token

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "data": {
    "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
    "expires_at": "2025-01-06T12:30:00.000Z"
  },
  "meta": {
    "timestamp": "2025-01-06T12:00:00.000Z"
  }
}
```

**Security Features:**
- Aggressive rate limiting: 5 requests/hour per IP (20 in dev)
- Token: 32 bytes (256 bits) random, base64url encoded
- Token hash: SHA-256, stored in DB
- Email normalized to lowercase
- Raw token never logged or persisted
- Default TTL: 30 minutes (configurable via `PASSWORD_RESET_TOKEN_TTL_MINUTES`)

**Error Responses:**
- `422` - Invalid email format (VALIDATION_FAILED)
- `429` - Rate limit exceeded (RATE_LIMIT_PASSWORD_RESET_EXCEEDED)
- `500` - Server error (INTERNAL_ERROR)

---

#### 2. POST `/api/auth/password-reset/confirm`
**Purpose:** Validate token and update user password

**Request:**
```json
{
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
  "new_password": "NewSecurePass123"
}
```

**Response (200):**
```json
{
  "data": {
    "status": "success",
    "message": "Password has been reset successfully"
  },
  "meta": {
    "timestamp": "2025-01-06T12:05:00.000Z"
  }
}
```

**Password Requirements:**
- Minimum 10 characters
- At least one lowercase letter
- At least one uppercase letter
- At least one digit
- Symbols optional

**Security Features:**
- Token validation: hash match, not used, not expired
- Single-use tokens (marked as used after successful reset)
- Password updated via Supabase Auth admin API
- Token marked as used ONLY after successful password update
- If password validation fails (Supabase policy), token remains reusable
- Raw token never logged
- Race condition protection: WHERE used_at IS NULL in update query

**Error Responses:**
- `400` - Invalid or expired token (PASSWORD_RESET_INVALID_OR_EXPIRED_TOKEN)
- `404` - User not found (PASSWORD_RESET_USER_NOT_FOUND)
- `422` - Weak password or validation failed (VALIDATION_FAILED or PASSWORD_RESET_WEAK_PASSWORD)
  - Backend validation: min 10 chars, lowercase, uppercase, digit
  - Supabase validation: returns actual Supabase error message
  - **Token NOT consumed** - can be retried with stronger password
- `500` - Password update failed (PASSWORD_RESET_FAILED)

---

### C) Configuration

**Environment Variable:**
```bash
PASSWORD_RESET_TOKEN_TTL_MINUTES=30  # Default: 30 minutes
```

**Rate Limiter:**
- File: `src/config/rateLimiter.ts`
- Export: `passwordResetLimiter`
- Limit: 5 requests/hour per IP (20 in development)

**Error Codes Added:**
- `PASSWORD_RESET_INVALID_OR_EXPIRED_TOKEN`
- `PASSWORD_RESET_WEAK_PASSWORD`
- `PASSWORD_RESET_USER_NOT_FOUND`
- `PASSWORD_RESET_FAILED`
- `RATE_LIMIT_PASSWORD_RESET_EXCEEDED`

---

### D) OpenAPI/Swagger Documentation

Both endpoints fully documented with:
- Request/response schemas
- Example payloads
- Error responses with proper `$ref` to shared Error schema
- Security marked as `[]` (public endpoints)

Access docs at: `http://localhost:3000/api-docs` (dev/staging only)

---

### E) Tests

**File:** `tests/passwordReset.test.ts`

**Test Coverage:**
1. **Request Endpoint:**
   - Returns 200 with token for valid email
   - Normalizes email to lowercase
   - Returns 422 for invalid email format
   - Returns 422 for missing email
   - Token is base64url encoded (no +, /, =)
   - Expires_at is 30 minutes in future
   - Generates different tokens for same email

2. **Confirm Endpoint:**
   - Returns 400 for invalid token
   - Returns 422 for weak passwords (too short, missing lowercase/uppercase/digit)
   - Returns 422 for missing token
   - Returns 404 when user not found
   - Validates response structure

3. **Token Security:**
   - Different tokens generated for same email
   - SHA-256 hash verification

**Run Tests:**
```bash
npm test passwordReset.test.ts
```

---

## Files Changed/Created

### Created:
1. `supabase/migrations/20250106_add_password_reset_tokens.sql` - Database migration
2. `tests/passwordReset.test.ts` - Test suite

### Modified:
1. `src/modules/auth/auth.routes.ts` - Added password reset endpoints
2. `src/constants/errorCodes.ts` - Added error codes and messages
3. `src/config/rateLimiter.ts` - Added passwordResetLimiter
4. `src/config/env.ts` - Added passwordResetTokenTtlMinutes config
5. `.env.example` - Added PASSWORD_RESET_TOKEN_TTL_MINUTES

---

## Integration with Bubble.io

### Step 1: Request Password Reset
**Bubble API Call:**
```
POST https://your-backend.com/api/auth/password-reset/request
Headers:
  x-api-key: YOUR_API_KEY
  Content-Type: application/json
Body:
  { "email": "user@example.com" }
```

**Bubble receives:**
```json
{
  "data": {
    "token": "abc123...",
    "expires_at": "2025-01-06T12:30:00.000Z"
  }
}
```

### Step 2: Send Email from Bubble
Use Bubble's email action to send:
```
Subject: Reset Your Password
Body:
  Click here to reset your password:
  https://admin-85091.bubbleapps.io/version-test/reset-password?token={TOKEN}
  
  This link expires at {EXPIRES_AT}
```

### Step 3: User Clicks Link
Bubble page extracts token from URL parameter

### Step 4: Confirm Password Reset
**Bubble API Call:**
```
POST https://your-backend.com/api/auth/password-reset/confirm
Headers:
  x-api-key: YOUR_API_KEY
  Content-Type: application/json
Body:
  {
    "token": "abc123...",
    "new_password": "NewSecurePass123"
  }
```

**Success Response (200):**
```json
{
  "data": {
    "status": "success",
    "message": "Password has been reset successfully"
  }
}
```

---

## Security Checklist ✅

- [x] No CAPTCHA (as requested)
- [x] No Supabase "send reset email" (backend doesn't send emails)
- [x] Only token hash stored in DB (raw token never persisted)
- [x] Single-use tokens (marked as used after successful reset)
- [x] Expiring tokens (default 30 minutes, configurable)
- [x] Aggressive rate limiting (5 requests/hour per IP)
- [x] Standardized API error schema across endpoints
- [x] OpenAPI/Swagger documentation for both endpoints
- [x] Minimal test coverage
- [x] Password strength validation (min 10 chars, lowercase, uppercase, digit)
- [x] Secure token generation (crypto.randomBytes, 256 bits)
- [x] SHA-256 hashing for token storage
- [x] Raw tokens never logged
- [x] Email normalization (lowercase)
- [x] Idempotent migration with IF NOT EXISTS

---

## Running the Migration

### Option 1: Supabase CLI
```bash
supabase db push
```

### Option 2: Manual SQL Execution
Run the SQL from `supabase/migrations/20250106_add_password_reset_tokens.sql` in Supabase SQL Editor

### Verify Migration:
```sql
SELECT * FROM password_reset_tokens LIMIT 1;
```

---

## Maintenance

### Cleanup Old Tokens
Run periodically (e.g., daily cron job):
```sql
SELECT cleanup_password_reset_tokens();
```

This removes tokens that are:
- Used and older than 24 hours
- Expired and older than 24 hours

---

## Testing Locally

### 1. Start Server
```bash
npm run dev
```

### 2. Request Token
```bash
curl -X POST http://localhost:3000/api/auth/password-reset/request \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

### 3. Confirm Reset
```bash
curl -X POST http://localhost:3000/api/auth/password-reset/confirm \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_FROM_STEP_2","new_password":"NewSecurePass123"}'
```

---

## Production Considerations

1. **Rate Limiting:** Adjust limits in production if needed (currently 5/hour)
2. **Token TTL:** Default 30 minutes is secure; adjust via env var if needed
3. **Monitoring:** Log password reset attempts for security monitoring
4. **Email Template:** Ensure Bubble email template is professional and clear
5. **HTTPS:** Always use HTTPS for reset links in production
6. **Token Cleanup:** Set up automated cleanup job (daily recommended)

---

## Troubleshooting

### Token Not Found Error
- Check token hasn't expired (30 min default)
- Verify token wasn't already used
- Ensure token is copied correctly (no extra spaces)

### User Not Found Error
- Verify user exists in Supabase Auth
- Check email matches exactly (case-insensitive)

### Rate Limit Exceeded
- Wait 1 hour before retrying
- In development, limits are relaxed (20/hour)

### Password Validation Failed
- Ensure minimum 10 characters
- Include at least one lowercase, uppercase, and digit

---

## API Documentation

Full API documentation available at:
- Development: `http://localhost:3000/api-docs`
- Staging: `https://staging-api.debedrijfsfiscalist.nl/api-docs`
- Production: Documentation disabled for security

---

## Support

For issues or questions:
1. Check error response `code` and `message`
2. Review logs with `request_id` from error response
3. Verify environment variables are set correctly
4. Ensure migration was applied successfully
