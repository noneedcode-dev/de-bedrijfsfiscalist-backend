# Test Setup Guide

## Overview

The test suite has been configured to run without requiring real Supabase credentials while keeping production behavior unchanged. This allows tests to run locally and in CI environments without access to live databases.

## Changes Made

### Part A: Environment Validation (Test-Safe)

**File: `src/config/env.ts`**

- Modified `getRequiredEnv()` to return safe dummy values when `NODE_ENV === 'test'`
- Production/dev environments still enforce strict validation
- Test defaults include all required Supabase and app configuration

### Part B: Auth Bypass for Tests

**Files Modified:**
- `src/middleware/apiKey.ts`
- `src/modules/auth/auth.middleware.ts`

**Behavior:**
- When `NODE_ENV === 'test'` AND `TEST_BYPASS_AUTH !== 'false'`, auth checks are bypassed
- Bypassed requests get a deterministic test user:
  ```typescript
  {
    sub: 'test-admin-user',
    role: 'admin',
    client_id: '',
    accessToken: 'test-token'
  }
  ```
- Production/dev behavior is completely unchanged
- Auth-specific tests can disable bypass by setting `TEST_BYPASS_AUTH='false'`

### Part C: Supabase Client Mocks

**File: `tests/setup.ts`**

- Mocks `createSupabaseAdminClient()` and `createSupabaseUserClient()`
- Prevents all network calls to Supabase during tests
- Returns deterministic mock data for common operations:
  - `from().select().eq().maybeSingle()` → returns test user
  - `auth.getUser()` → returns authenticated test user
  - All query builder methods are chainable

### Part D: Test Runner Configuration

**File: `vitest.config.ts`**

- Configures Vitest to load `tests/setup.ts` before running tests
- Sets up global test environment
- Enables coverage reporting

**File: `tests/setup.ts`**

- Sets required environment variables with dummy values
- Configures Supabase client mocks
- Runs before all tests via `beforeAll()`

### Part E: Test Expectations Updated

**Files Updated:**
- `tests/auth.test.ts`
- `tests/taxCalendar.test.ts`
- `tests/authorization.test.ts`
- `tests/adminUsers.test.ts`

**Changes:**
- Updated assertions from `res.body.error` to `res.body.code`
- Updated expected error codes to match standardized format:
  - `AUTH_MISSING_HEADER`
  - `AUTH_INVALID_FORMAT`
  - `AUTH_INVALID_TOKEN`
  - `AUTH_INVALID_CLAIMS`
  - `AUTH_INSUFFICIENT_PERMISSIONS`

## Running Tests

### Default Mode (Auth Bypass Enabled)

```bash
npm test
```

This runs all tests with auth bypass enabled. No API keys or JWT tokens required.

### Testing Auth Behavior (Auth Bypass Disabled)

```bash
TEST_BYPASS_AUTH=false npm test
```

This disables the auth bypass, requiring proper headers and tokens for auth tests.

### Watch Mode

```bash
npm run test:watch
```

### Without Real Supabase Credentials

Tests will run successfully even without `.env` file or real Supabase credentials:

```bash
NODE_ENV=test npm test
```

## Environment Variables for Tests

The following variables are automatically set with dummy values in test mode:

- `NODE_ENV=test`
- `TEST_BYPASS_AUTH=true` (default, set to 'false' to test auth)
- `PORT=3000`
- `FRONTEND_URL=http://localhost:3000`
- `SUPABASE_URL=http://localhost:54321`
- `SUPABASE_ANON_KEY=test-anon-key`
- `SUPABASE_SERVICE_ROLE_KEY=test-service-role-key`
- `SUPABASE_JWT_SECRET=test-jwt-secret-min-32-chars-long-for-hs256`
- `APP_API_KEY=test-api-key`

## Manual Verification Checklist

✅ Run tests with NO real Supabase envs present
```bash
rm .env && NODE_ENV=test npm test
```

✅ Confirm test suite does not fail on missing envs

✅ Confirm a sample request test can hit `/api/admin/clients` without headers and still return 200 (because bypass)

✅ Confirm auth tests can be enabled by setting `TEST_BYPASS_AUTH=false` and then requiring headers

## Security Notes

- ✅ No security weakening outside test environment
- ✅ No real secrets committed
- ✅ Production behavior unchanged
- ✅ Auth bypass only active when `NODE_ENV === 'test'`
- ✅ All API responses maintain their 200/201 payload structure

## CI/CD Integration

For CI environments, simply ensure `NODE_ENV=test` is set. No other configuration needed:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test
  env:
    NODE_ENV: test
```

## Troubleshooting

### Tests still failing with "Missing required environment variable"

- Ensure `NODE_ENV=test` is set
- Check that `vitest.config.ts` includes `setupFiles: ['./tests/setup.ts']`

### Auth tests passing when they shouldn't

- Set `TEST_BYPASS_AUTH=false` to disable bypass
- Verify the test is actually checking auth behavior

### Supabase network calls still happening

- Verify `tests/setup.ts` is being loaded (check vitest config)
- Ensure mocks are defined before any imports that use Supabase client
