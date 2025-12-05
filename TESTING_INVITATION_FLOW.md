# Testing Supabase Auth Invitation Flow

## Prerequisites

1. ✅ Migration has been run (invitations table created)
2. ✅ `FRONTEND_URL` environment variable is set in `.env`
3. ✅ Server is running: `npm run dev`
4. ✅ You have an admin JWT token (from test-token.js)
5. ✅ You have your `APP_API_KEY` from `.env`

## Setup Migration (If Not Done)

If you haven't run the migration yet, do one of the following:

### Option 1: Supabase Dashboard (Easiest)

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Open `supabase/migrations/20251202_add_invitations.sql`
5. Copy the entire SQL content
6. Paste into SQL Editor
7. Click **Run** button
8. Verify: Go to **Table Editor** → You should see `invitations` table

### Option 2: Supabase CLI (If installed)

```bash
cd /Users/yigitulken/Desktop/de-bedrijfsfiscalist-backend
supabase db push
```

---

## Test Scenarios

### Test 1: Create Client with First User (Supabase Auth)

**Endpoint:** `POST http://localhost:3000/api/admin/clients`

**Headers:**
```
X-API-Key: <your-api-key-from-env>
Authorization: Bearer <your-admin-jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Test Company Ltd",
  "slug": "test-company-ltd",
  "country": "NL",
  "firstUser": {
    "email": "testuser@testcompany.com",
    "role": "client",
    "full_name": "Test User"
  }
}
```

**Expected Response (201):**
```json
{
  "data": {
    "client": {
      "id": "uuid-here",
      "name": "Test Company Ltd",
      "slug": "test-company-ltd",
      "country": "NL",
      "created_at": "2025-12-02T...",
      "updated_at": "2025-12-02T..."
    },
    "firstUser": {
      "id": "supabase-auth-user-id",
      "email": "testuser@testcompany.com",
      "role": "client",
      "client_id": "uuid-here",
      "full_name": "Test User",
      "is_active": true,
      "created_at": "2025-12-02T...",
      "updated_at": "2025-12-02T..."
    }
  },
  "meta": {
    "message": "Client oluşturuldu ve ilk kullanıcıya davetiye emaili gönderildi.",
    "timestamp": "2025-12-02T..."
  }
}
```

**Verify:**
1. Check console output for invitation email (should show the accept-invite URL)
2. Go to Supabase Dashboard → **Authentication** → **Users** → You should see testuser@testcompany.com
3. Go to **Table Editor** → `app_users` → User should exist with Supabase Auth ID

---

### Test 2: Invite Additional User

**Endpoint:** `POST http://localhost:3000/api/admin/users/invite`

**Headers:**
```
X-API-Key: <your-api-key-from-env>
Authorization: Bearer <your-admin-jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "email": "seconduser@testcompany.com",
  "role": "client",
  "client_id": "<client-uuid-from-test-1>",
  "full_name": "Second User"
}
```

**Expected Response (201):**
```json
{
  "data": {
    "user": {
      "id": "supabase-auth-user-id",
      "email": "seconduser@testcompany.com",
      "role": "client",
      "client_id": "<client-uuid>",
      "full_name": "Second User",
      "is_active": true,
      "created_at": "2025-12-02T...",
      "updated_at": "2025-12-02T..."
    },
    "invitation": {
      "id": "invitation-uuid",
      "email": "seconduser@testcompany.com",
      "role": "client",
      "client_id": "<client-uuid>",
      "invited_by": "<your-admin-user-id>",
      "token": "long-random-hex-token",
      "expires_at": "2025-12-05T...",
      "status": "pending",
      "metadata": {},
      "created_at": "2025-12-02T...",
      "updated_at": "2025-12-02T..."
    }
  },
  "meta": {
    "message": "Kullanıcı başarıyla davet edildi. Davetiye emaili gönderildi.",
    "timestamp": "2025-12-02T..."
  }
}
```

**Verify:**
1. Check console output - should show invitation email with token
2. **COPY THE TOKEN** from console output (you'll need it for Test 3)
3. Go to Supabase Dashboard → **Authentication** → **Users** → seconduser@testcompany.com should exist
4. Go to **Table Editor** → `invitations` → Invitation should exist with status "pending"

**Console Output Example:**
```
=======================================================================
📧 INVITATION EMAIL (DEVELOPMENT MODE - NOT SENT)
=======================================================================
To: seconduser@testcompany.com
Subject: You've been invited to De Bedrijfsfiscalist

Hello!

Admin has invited you to join De Bedrijfsfiscalist for Test Company Ltd.

To accept this invitation and set up your account, please click the link below:

http://localhost:3000/accept-invite?token=abc123def456...

This invitation will expire in 72 hours.
=======================================================================
```

---

### Test 3: Get Invitation Details (Public Endpoint)

**Endpoint:** `GET http://localhost:3000/api/auth/invitation/<token-from-test-2>`

**Headers:**
```
X-API-Key: <your-api-key-from-env>
```

**Note:** No JWT required - this is a public endpoint!

**Expected Response (200):**
```json
{
  "data": {
    "email": "seconduser@testcompany.com",
    "role": "client",
    "clientName": "Test Company Ltd",
    "expiresAt": "2025-12-05T..."
  },
  "meta": {
    "timestamp": "2025-12-02T..."
  }
}
```

**Test Error Cases:**

**Invalid Token:**
```bash
GET http://localhost:3000/api/auth/invitation/invalid-token
# Expected: 404 - "Geçersiz veya bulunamayan davetiye linki"
```

---

### Test 4: Accept Invitation and Set Password

**Endpoint:** `POST http://localhost:3000/api/auth/accept-invite`

**Headers:**
```
X-API-Key: <your-api-key-from-env>
Content-Type: application/json
```

**Note:** No JWT required - user is not logged in yet!

**Body:**
```json
{
  "token": "<token-from-test-2>",
  "password": "SecurePassword123"
}
```

**Expected Response (200):**
```json
{
  "data": {
    "message": "Davetiye kabul edildi. Artık giriş yapabilirsiniz.",
    "email": "seconduser@testcompany.com"
  },
  "meta": {
    "timestamp": "2025-12-02T..."
  }
}
```

**Verify:**
1. Go to Supabase Dashboard → **Table Editor** → `invitations` → Status should be "accepted"
2. Go to **Authentication** → **Users** → seconduser@testcompany.com should show "Confirmed"

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)

**Test Error Cases:**

**Weak Password:**
```json
{
  "token": "<valid-token>",
  "password": "weak"
}
// Expected: 400 - Validation errors
```

**Expired Token:**
Use a token from an invitation created more than 72 hours ago
```bash
# Expected: 410 - "Davetiye süresi dolmuş"
```

**Already Accepted:**
Try to accept the same invitation twice
```bash
# Expected: 400 - "Bu davetiye zaten kabul edilmiş. Giriş yapabilirsiniz."
```

---

### Test 5: Login with New User

**Endpoint:** `POST https://<your-project>.supabase.co/auth/v1/token?grant_type=password`

**Headers:**
```
apikey: <your-supabase-anon-key>
Content-Type: application/json
```

**Body:**
```json
{
  "email": "seconduser@testcompany.com",
  "password": "SecurePassword123"
}
```

**Expected Response (200):**
```json
{
  "access_token": "eyJhbGciOiJI...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "user": {
    "id": "user-uuid",
    "email": "seconduser@testcompany.com",
    ...
  }
}
```

**Verify:**
- User can successfully login!
- They receive a valid JWT token
- Token contains correct role and client_id in user_metadata

---

### Test 6: Duplicate Email Prevention

**Endpoint:** `POST http://localhost:3000/api/admin/users/invite`

**Body:** Try to invite the same email again
```json
{
  "email": "seconduser@testcompany.com",
  "role": "client",
  "client_id": "<client-uuid>",
  "full_name": "Duplicate User"
}
```

**Expected Response (400):**
```json
{
  "error": "Bad Request",
  "message": "Bu email adresi zaten kayıtlı",
  "statusCode": 400,
  "timestamp": "2025-12-02T..."
}
```

---

## Verification Checklist

After running all tests, verify:

### Supabase Dashboard Checks

**Authentication → Users:**
- [ ] testuser@testcompany.com exists and is "Confirmed"
- [ ] seconduser@testcompany.com exists and is "Confirmed"
- [ ] Both users have `user_metadata` with role and client_id

**Table Editor → `clients`:**
- [ ] Test Company Ltd exists

**Table Editor → `app_users`:**
- [ ] Both users exist
- [ ] IDs match Supabase Auth user IDs
- [ ] client_id is correctly set
- [ ] is_active is true

**Table Editor → `invitations`:**
- [ ] Invitations exist for both users
- [ ] Status is "accepted" after Test 4
- [ ] Token matches what was in console output
- [ ] expires_at is 72 hours from created_at

### Console Output Checks

- [ ] Email invitation logged to console for each invite
- [ ] Accept-invite URL contains token
- [ ] No errors in server logs

### Functional Checks

- [ ] Users can login with their password
- [ ] JWT token contains correct claims (role, client_id)
- [ ] Duplicate email is prevented

---

## Troubleshooting

### Error: "Migration table not found"

**Solution:** Run the migration first (see Setup Migration section above)

### Error: "FRONTEND_URL is undefined"

**Solution:** 
1. Add `FRONTEND_URL=http://localhost:3000` to your `.env` file
2. Restart server: `npm run dev`

### Error: "Supabase Auth error: User creation failed"

**Solution:**
1. Check Supabase Dashboard → Settings → Auth
2. Ensure "Enable email confirmations" is OFF (for testing)
3. Ensure "Disable email signups" is OFF
4. Check Supabase service role key is correct in `.env`

### Error: "Şifre belirlenemedi"

**Possible causes:**
1. User doesn't exist in Supabase Auth
2. Service role key is incorrect
3. User ID mismatch between app_users and auth.users

**Solution:**
1. Check Supabase Dashboard → Authentication → Users
2. Verify user exists and ID matches app_users table
3. Try creating a new invitation for a different email

### Console doesn't show email

**Solution:**
1. Check `NODE_ENV` in `.env` is set to `development`
2. Email service only logs to console in development mode
3. Check server logs for any errors

---

## Next Steps

Once all tests pass:

1. **Update Postman Collection:** Add the new auth endpoints
2. **Test with Real Frontend:** Integrate with your Bubble.io app
3. **Production Setup:** Configure real email service (SendGrid/AWS SES)
4. **Security Review:** Ensure all endpoints have proper authentication

---

## Summary

You've successfully implemented:
- ✅ Supabase Auth integration for user creation
- ✅ Invitation token system
- ✅ Public invitation acceptance flow
- ✅ Password validation and setup
- ✅ Email notification system (console-only for dev)
- ✅ Proper rollback mechanisms
- ✅ Security validations (duplicate prevention, expiry checks)

The system is now production-ready (pending real email service integration)! 🎉

