// generate-token.js - Generate JWT token for a user
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const targetEmail = 'yigitulken@gmail.com';

async function generateToken() {
  console.log(`🔍 Finding user: ${targetEmail}\n`);

  // Get user from app_users
  const { data: appUser, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', targetEmail)
    .single();

  if (error || !appUser) {
    console.error('❌ User not found:', error?.message);
    process.exit(1);
  }

  console.log('👤 User found:');
  console.log(`   ID: ${appUser.id}`);
  console.log(`   Email: ${appUser.email}`);
  console.log(`   Role: ${appUser.role}`);
  console.log(`   Client ID: ${appUser.client_id || '(none)'}\n`);

  // Generate JWT token with Supabase-compatible claims
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 60 * 60 * 24 * 7; // 7 days

  const payload = {
    // Standard JWT claims
    aud: 'authenticated',
    exp: now + expiresIn,
    iat: now,
    iss: `${supabaseUrl}/auth/v1`,
    sub: appUser.id,
    
    // User info
    email: appUser.email,
    phone: '',
    
    // App-specific claims (used by RLS policies)
    role: appUser.role,
    client_id: appUser.client_id,
    
    // Supabase metadata
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {
      full_name: appUser.full_name,
      role: appUser.role,
      client_id: appUser.client_id,
    },
    
    // Session info
    session_id: require('crypto').randomUUID(),
  };

  const token = jwt.sign(payload, jwtSecret, { algorithm: 'HS256' });

  console.log('═'.repeat(100));
  console.log('🔐 JWT Token for ' + targetEmail);
  console.log('═'.repeat(100));
  console.log('\n' + token + '\n');
  console.log('═'.repeat(100));
  
  console.log('\n📋 Token Details:');
  console.log(`   Subject (sub): ${payload.sub}`);
  console.log(`   Role: ${payload.role}`);
  console.log(`   Client ID: ${payload.client_id || '(none)'}`);
  console.log(`   Issued At: ${new Date(payload.iat * 1000).toISOString()}`);
  console.log(`   Expires At: ${new Date(payload.exp * 1000).toISOString()}`);
  
  console.log('\n🧪 Test with curl:');
  console.log(`   curl -H "Authorization: Bearer ${token.substring(0, 50)}..." http://localhost:3000/api/health`);
}

generateToken();



