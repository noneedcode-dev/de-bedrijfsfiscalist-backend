require('dotenv').config();
const jwt = require('jsonwebtoken');

const secret = process.env.SUPABASE_JWT_SECRET;
if (!secret) {
  console.error('❌ Missing SUPABASE_JWT_SECRET in .env');
  process.exit(1);
}

const clientId = process.argv[2] || null;
const crypto = require('crypto');

const payloadAdmin = {
  sub: crypto.randomUUID(),
  role: 'authenticated',
  app_role: 'admin',
  iss: 'supabase',
  aud: 'authenticated',
};

if (clientId) {
  payloadAdmin.client_id = clientId;
}

const token = jwt.sign(payloadAdmin, secret, {
  expiresIn: '7d',
});

console.log('\n🔑 Test JWT Token (app_role: admin):\n');
console.log(token);
console.log('\n📋 Claims:');
console.log(JSON.stringify(payloadAdmin, null, 2));
console.log('\n✅ Token valid for 7 days\n');

if (!clientId) {
  console.log('💡 Tip: Add client_id as argument: node make-test-jwt.js <CLIENT_ID>\n');
}
