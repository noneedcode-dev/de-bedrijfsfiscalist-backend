# Environment Variables Setup

## Required Addition to .env File

Add the following environment variable to your `.env` file:

```bash
# Frontend URL (for invitation emails and redirects)
# For Bubble.io development: https://version-test.yourapp.bubbleapps.io
# For Bubble.io production: https://yourdomain.com
# For local development: http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

## Complete .env File Template

Your `.env` file should contain:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Backend Authentication
APP_API_KEY=your-api-key-here
APP_JWT_SECRET=your-jwt-secret-here
APP_JWT_ISSUER=de-bedrijfsfiscalist-backend
APP_JWT_AUDIENCE=frontend

# Frontend URL (NEW - Required for Supabase Auth Integration)
FRONTEND_URL=http://localhost:3000

# Google Drive (optional)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# AWS S3 (optional)
S3_BUCKET_NAME=your-bucket-name
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_REGION=eu-central-1

# Email Service (optional - for production)
# SENDGRID_API_KEY=your-sendgrid-key
# AWS_SES_REGION=eu-central-1
# AWS_SES_ACCESS_KEY=your-ses-key
# AWS_SES_SECRET_KEY=your-ses-secret

# Stripe (optional - for future payment integration)
# STRIPE_SECRET_KEY=your-stripe-key
# STRIPE_WEBHOOK_SIGNING_SECRET=your-webhook-secret
```

## Usage

The `FRONTEND_URL` is used for:

1. **Invitation Emails**: The accept-invite URL sent to new users
2. **Redirect After Auth**: Where users go after accepting invitation
3. **CORS Configuration**: (Future) Restricting API access to your frontend

### Example Values

**Development (Local):**
```bash
FRONTEND_URL=http://localhost:3000
```

**Development (Bubble.io):**
```bash
FRONTEND_URL=https://version-test.yourapp.bubbleapps.io
```

**Production (Bubble.io with custom domain):**
```bash
FRONTEND_URL=https://yourdomain.com
```

## Next Steps

1. Add `FRONTEND_URL` to your `.env` file
2. Restart your development server: `npm run dev`
3. Test the invitation flow with Postman

