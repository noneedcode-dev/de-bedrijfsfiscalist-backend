require('dotenv').config();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const adminPayload = {
  sub: crypto.randomUUID(),
  role: 'admin',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
};

const token = jwt.sign(adminPayload, process.env.SUPABASE_JWT_SECRET);

console.log('\n🔑 Admin JWT Token:\n');
console.log(token);
console.log('\n📋 Kopyalayın ve Postman\'de kullanın!');
console.log('✅ Token 24 saat geçerli\n');
