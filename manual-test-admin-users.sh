#!/bin/bash

# Manual test script for GET /api/admin/users endpoint
# Run this after starting the server with: npm run dev

API_URL="http://localhost:3000"
API_KEY="${APP_API_KEY:-test-api-key}"

# Generate a test admin JWT token (requires node)
ADMIN_TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { sub: 'admin123', role: 'admin' },
  process.env.SUPABASE_JWT_SECRET || 'your_supabase_jwt_secret',
  { expiresIn: '1h' }
);
console.log(token);
")

echo "Testing GET /api/admin/users endpoint..."
echo "=========================================="
echo ""

# Test 1: Valid request with role=admin
echo "Test 1: GET /api/admin/users?role=admin (should return 200)"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/api/admin/users?role=admin" | jq '.'
echo ""

# Test 2: Invalid role (should return 422 with VALIDATION_FAILED)
echo "Test 2: GET /api/admin/users?role=invalid (should return 422 with VALIDATION_FAILED)"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/api/admin/users?role=invalid" | jq '.'
echo ""

# Test 3: Invalid UUID (should return 422 with VALIDATION_FAILED)
echo "Test 3: GET /api/admin/users?client_id=invalid-uuid (should return 422 with VALIDATION_FAILED)"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/api/admin/users?client_id=invalid-uuid" | jq '.'
echo ""

# Test 4: Limit > 100 (should return 422 with VALIDATION_FAILED)
echo "Test 4: GET /api/admin/users?limit=101 (should return 422 with VALIDATION_FAILED)"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/api/admin/users?limit=101" | jq '.'
echo ""

# Test 5: Negative offset (should return 422 with VALIDATION_FAILED)
echo "Test 5: GET /api/admin/users?offset=-1 (should return 422 with VALIDATION_FAILED)"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/api/admin/users?offset=-1" | jq '.'
echo ""

echo "=========================================="
echo "All tests completed!"
echo ""
echo "Expected results:"
echo "- Test 1: HTTP 200 with data array and meta object"
echo "- Test 2-5: HTTP 422 with code='VALIDATION_FAILED', request_id, and timestamp"
