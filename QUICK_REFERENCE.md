# Test Configuration - Quick Reference

## Running Tests

```bash
# Default: Auth bypass enabled (no headers needed)
npm test

# Auth tests: Bypass disabled (headers required)
TEST_BYPASS_AUTH=false npm test

# Specific test file
npm test -- health.test.ts

# Watch mode
npm run test:watch
```

## How It Works

### Test Mode Detection
- Tests automatically run in test mode via `NODE_ENV=test`
- Set in `tests/setup.ts` before any imports

### Auth Bypass (Default: ON)
When `NODE_ENV === 'test'` AND `TEST_BYPASS_AUTH !== 'false'`:
- ✅ API key check skipped
- ✅ JWT verification skipped
- ✅ All requests get test admin user:
  ```json
  {
    "sub": "test-admin-user",
    "role": "admin",
    "client_id": "",
    "accessToken": "test-token"
  }
  ```

### Supabase Mocking
- All Supabase client calls are mocked
- No network requests to Supabase
- Returns deterministic test data

## Files Changed

| File | Purpose |
|------|---------|
| `src/config/env.ts` | Skip strict validation in test mode |
| `src/middleware/apiKey.ts` | Bypass API key check in tests |
| `src/modules/auth/auth.middleware.ts` | Bypass JWT auth in tests |
| `tests/setup.ts` | Test environment setup + mocks |
| `vitest.config.mjs` | Vitest configuration |
| `tests/*.test.ts` | Updated error format assertions |

## Environment Variables (Auto-Set)

```bash
NODE_ENV=test
TEST_BYPASS_AUTH=true  # Set to 'false' to test auth
PORT=3000
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=test-anon-key
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
SUPABASE_JWT_SECRET=test-jwt-secret-min-32-chars-long-for-hs256
APP_API_KEY=test-api-key
```

## Production Safety

✅ Auth bypass **ONLY** active when:
1. `NODE_ENV === 'test'` **AND**
2. `TEST_BYPASS_AUTH !== 'false'`

✅ Production/dev behavior **completely unchanged**

✅ No real secrets in code

## Troubleshooting

**Tests fail with "Missing required environment variable"**
- Ensure `NODE_ENV=test` is set
- Check `vitest.config.mjs` includes `setupFiles: ['./tests/setup.ts']`

**Auth tests passing when they shouldn't**
- Set `TEST_BYPASS_AUTH=false`

**Supabase network calls happening**
- Verify `tests/setup.ts` is loaded (check console output)

## CI/CD

```yaml
# GitHub Actions
- name: Run tests
  run: npm test
  env:
    NODE_ENV: test
```

No additional configuration needed!
