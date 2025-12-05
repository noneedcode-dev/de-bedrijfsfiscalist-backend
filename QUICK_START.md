# Quick Start - Supabase Auth Integration

## 🚀 Get Started in 5 Minutes

### Step 1: Run the Migration ⚡

**Option A: Supabase Dashboard (Easiest)**

1. Open your Supabase project: https://supabase.com/dashboard
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. Open file: `supabase/migrations/20251202_add_invitations.sql`
5. Copy all content and paste into SQL Editor
6. Click **Run** button
7. ✅ You should see "Success. No rows returned"

**Verify:** Go to **Table Editor** → You should see new `invitations` table

---

### Step 2: Update Environment Variables 🔧

Add this line to your `.env` file:

```bash
# Add this at the end of your .env file
FRONTEND_URL=http://localhost:3000
```

💡 **For Bubble.io:** Use your Bubble app URL instead:
```bash
FRONTEND_URL=https://version-test.yourapp.bubbleapps.io
```

---

### Step 3: Restart Server 🔄

```bash
npm run dev
```

✅ Server should start without errors

---

### Step 4: Quick Test 🧪

#### Generate Admin Token (if you don't have one)

```bash
node test-token.js
```

Copy the token from output.

#### Test Invitation Flow

**Postman Request:**

```
POST http://localhost:3000/api/admin/users/invite

Headers:
  X-API-Key: <your-api-key-from-env>
  Authorization: Bearer <admin-token-from-above>
  Content-Type: application/json

Body:
{
  "email": "test@example.com",
  "role": "admin",
  "full_name": "Test User"
}
```

**Expected Result:**
- ✅ 201 response
- ✅ Console shows invitation email with token
- ✅ User appears in Supabase Dashboard → Authentication → Users

---

### Step 5: Accept Invitation 📝

Look at console output from Step 4, copy the **token** from the URL:

```
http://localhost:3000/accept-invite?token=ABC123...
                                           ^^^^^^^ (copy this)
```

**Postman Request:**

```
POST http://localhost:3000/api/auth/accept-invite

Headers:
  X-API-Key: <your-api-key>
  Content-Type: application/json

Body:
{
  "token": "ABC123...",
  "password": "SecurePass123"
}
```

**Expected Result:**
- ✅ 200 response: "Davetiye kabul edildi. Artık giriş yapabilirsiniz."

---

### Step 6: Test Login 🔐

Now test that the user can actually login:

```
POST https://<your-project>.supabase.co/auth/v1/token?grant_type=password

Headers:
  apikey: <your-supabase-anon-key>
  Content-Type: application/json

Body:
{
  "email": "test@example.com",
  "password": "SecurePass123"
}
```

**Expected Result:**
- ✅ 200 response with access_token
- ✅ User successfully logged in! 🎉

---

## ✅ Success!

You now have a fully working invitation system with:

- Real Supabase Auth integration
- Token-based invitations
- Password validation
- User login capability

---

## 📚 Next Steps

1. **Full Testing:** See `TESTING_INVITATION_FLOW.md` for comprehensive tests
2. **Integration:** Connect to your Bubble.io frontend
3. **Production:** Configure real email service (SendGrid/AWS SES)

---

## 🆘 Need Help?

**Common Issues:**

❌ **"Migration table not found"**  
→ Run Step 1 again

❌ **"FRONTEND_URL is undefined"**  
→ Complete Step 2 and restart server

❌ **"Supabase Auth error"**  
→ Check your Supabase service role key in `.env`

❌ **401 Unauthorized**  
→ Check your API key and admin token

**Full troubleshooting:** See `TESTING_INVITATION_FLOW.md`

---

## 📖 Documentation Files

- `QUICK_START.md` (this file) - Get started fast
- `TESTING_INVITATION_FLOW.md` - Comprehensive testing guide
- `ENVIRONMENT_SETUP.md` - Environment variables guide
- `IMPLEMENTATION_SUMMARY.md` - Complete implementation details

---

**Ready to test?** Follow the steps above! 🚀

