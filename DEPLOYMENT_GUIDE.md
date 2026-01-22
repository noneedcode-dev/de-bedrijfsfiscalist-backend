# External Storage Integration - Production Deployment Guide

## ✅ Pre-Deployment Checklist

### 1. Code Review
- ✅ All 4 production blockers resolved
- ✅ Token encryption implemented (AES-256-GCM)
- ✅ OAuth state validation (signed JWT)
- ✅ Atomic job claiming (SKIP LOCKED)
- ✅ Route mounting correct (client-scoped + callback)
- ✅ Encryption key validation at boot

### 2. Dependencies
```bash
npm install
```
**Verify:** `axios@^1.6.5` is installed in `package.json`

---

## 🔐 Step 1: Generate Encryption Key

**Run this command:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example output:**
```
c2c3ac3dc5a4acc88fa6cc25cf199214f3320a0f17c23af4f3fdfd759fe613b3
```

**⚠️ IMPORTANT:** 
- Save this key securely (password manager, secrets vault)
- Never commit to git
- Use different keys for dev/staging/production

---

## 🔧 Step 2: Configure Environment Variables

### Production `.env`

Add these variables to your production environment:

```bash
# External Storage Token Encryption (REQUIRED)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
EXTERNAL_STORAGE_TOKEN_ENCRYPTION_KEY=<your_generated_key_here>

# Google Drive OAuth (if using Google Drive)
GOOGLE_DRIVE_CLIENT_ID=<your_google_client_id>
GOOGLE_DRIVE_CLIENT_SECRET=<your_google_client_secret>
GOOGLE_DRIVE_REDIRECT_URI=https://your-domain.com/api/external-storage/callback/google_drive

# Microsoft Graph OAuth (if using Microsoft 365)
MICROSOFT_CLIENT_ID=<your_microsoft_client_id>
MICROSOFT_CLIENT_SECRET=<your_microsoft_client_secret>
MICROSOFT_REDIRECT_URI=https://your-domain.com/api/external-storage/callback/microsoft_graph
```

### OAuth App Setup

**Google Drive:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `https://your-domain.com/api/external-storage/callback/google_drive`
4. Scopes: `https://www.googleapis.com/auth/drive.file`

**Microsoft Graph:**
1. Go to [Azure Portal](https://portal.azure.com/)
2. Register app in Azure AD
3. Add redirect URI: `https://your-domain.com/api/external-storage/callback/microsoft_graph`
4. API permissions: `Files.ReadWrite.All`, `offline_access`

---

## 🗄️ Step 3: Apply Database Migration

### Option A: Supabase CLI
```bash
supabase db push
```

### Option B: Manual SQL
Run the migration file in your database:
```bash
psql -h <host> -U <user> -d <database> -f supabase/migrations/20260122_add_external_storage.sql
```

**Migration adds:**
- `external_storage_connections` table
- `external_upload_jobs` table
- `client_settings` table (or extends if exists)
- Document table columns for external sync
- RLS policies
- `claim_external_upload_job()` function with SKIP LOCKED

**Verify migration:**
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('external_storage_connections', 'external_upload_jobs');

-- Check function exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'claim_external_upload_job';
```

---

## 🚀 Step 4: Deploy Application

### Deployment Steps
1. **Build:**
   ```bash
   npm run build
   ```

2. **Deploy to your platform:**
   - Railway: `railway up`
   - Vercel: `vercel --prod`
   - Heroku: `git push heroku main`
   - Docker: `docker build -t app . && docker push`

3. **Set environment variables** in your platform's dashboard

4. **Start application:**
   ```bash
   npm start
   ```

### Boot Verification
Application will validate encryption key on startup:
```
✓ Environment variables validated successfully
✓ Running in production mode
✓ Server will listen on port 3000
✓ External storage encryption key validated
```

**If key is invalid, app will fail-fast with error:**
```
Error: EXTERNAL_STORAGE_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).
```

---

## ✅ Step 5: Post-Deployment Verification

### 1. Health Check
```bash
curl https://your-domain.com/health
```
Expected: `200 OK`

### 2. Test OAuth Flow (Manual)

**Google Drive:**
```bash
# Get auth URL (requires valid JWT)
curl -X GET https://your-domain.com/api/clients/{clientId}/external-storage/google_drive/auth-url \
  -H "Authorization: Bearer {jwt_token}" \
  -H "x-api-key: {api_key}"
```

Expected response:
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&state=..."
}
```

**Verify state is JWT:**
- Extract `state` parameter from URL
- Decode JWT (should contain: `clientId`, `provider`, `nonce`, `iat`, `exp`)

### 3. Test Route Paths

**Client-scoped routes (requires auth):**
```bash
curl https://your-domain.com/api/clients/{clientId}/external-storage \
  -H "Authorization: Bearer {jwt}" \
  -H "x-api-key: {api_key}"
```
Expected: `200` with connection list

**Callback route (no auth):**
```bash
curl https://your-domain.com/api/external-storage/callback/google_drive?code=test&state=invalid \
  -H "x-api-key: {api_key}"
```
Expected: `400` (invalid state)

### 4. Verify Token Encryption

**Check database:**
```sql
SELECT access_token FROM external_storage_connections LIMIT 1;
```

**Expected format:**
```
c3f2a1b4....:e8d9c2b1....:a7f6e5d4....
(iv:authTag:cipher - not plain text)
```

### 5. Monitor Job Processing

**Check job worker logs:**
```bash
# Look for these log entries
"Processed N external upload jobs"
"Failed to claim external upload job" (if any errors)
```

**Check job status in database:**
```sql
SELECT provider, status, COUNT(*) 
FROM external_upload_jobs 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY provider, status;
```

---

## 🔍 Monitoring & Troubleshooting

### Key Metrics to Monitor

1. **Job Success Rate:**
   ```sql
   SELECT 
     provider,
     status,
     COUNT(*) as count,
     AVG(attempts) as avg_attempts
   FROM external_upload_jobs
   WHERE created_at > NOW() - INTERVAL '24 hours'
   GROUP BY provider, status;
   ```

2. **Connection Health:**
   ```sql
   SELECT provider, status, COUNT(*)
   FROM external_storage_connections
   GROUP BY provider, status;
   ```

3. **Failed Jobs (needs attention):**
   ```sql
   SELECT * FROM external_upload_jobs
   WHERE status = 'failed' AND attempts >= 3
   ORDER BY created_at DESC
   LIMIT 10;
   ```

### Common Issues

**Issue: "Token refresh failed" errors**
- **Cause:** Refresh token expired or revoked
- **Fix:** User must reconnect via OAuth flow
- **Prevention:** Monitor `expires_at` and refresh proactively

**Issue: Jobs stuck in "pending"**
- **Cause:** Worker not running or connection error
- **Fix:** Check `ENABLE_JOBS=true` in production, verify connection status
- **Prevention:** Monitor job age, alert on old pending jobs

**Issue: "Invalid encryption key" on boot**
- **Cause:** Key not 64 hex characters
- **Fix:** Regenerate key with provided command
- **Prevention:** Use key validation in CI/CD

**Issue: OAuth callback fails with "Invalid state"**
- **Cause:** State expired (>10 min) or JWT secret mismatch
- **Fix:** Ensure `SUPABASE_JWT_SECRET` matches across environments
- **Prevention:** Complete OAuth flow within 10 minutes

---

## 🔄 Rollback Plan

If critical issues occur:

### 1. Disable Mirroring
```sql
UPDATE client_settings 
SET documents_mirror_enabled = false 
WHERE documents_mirror_enabled = true;
```

### 2. Stop Job Processing
Set environment variable:
```bash
ENABLE_JOBS=false
```

### 3. Revert Code (if needed)
```bash
git revert <commit_hash>
git push origin main
```

**Note:** Migration is backward compatible - no need to rollback database

---

## 📊 Success Criteria

Deployment is successful when:

- ✅ Application boots without errors
- ✅ Encryption key validation passes
- ✅ OAuth URLs generate with signed JWT state
- ✅ Tokens stored encrypted in database
- ✅ Job worker claims jobs atomically (no duplicates)
- ✅ Client-scoped routes require authentication
- ✅ Callback route accessible without auth
- ✅ No token leaks in logs or API responses

---

## 📞 Support

For issues:
1. Check application logs for errors
2. Verify environment variables are set correctly
3. Check database migration applied successfully
4. Review audit logs for security events
5. Monitor job processing status

**Documentation:**
- `EXTERNAL_STORAGE_IMPLEMENTATION.md` - Full technical details
- `EXTERNAL_STORAGE_HARDENING_SUMMARY.md` - Security improvements
- `README.md` - General project documentation

---

## 🎉 Production Ready

All critical security blockers resolved. Safe to deploy.

**Last Updated:** 2026-01-22
