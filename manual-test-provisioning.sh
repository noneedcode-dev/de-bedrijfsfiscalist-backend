#!/bin/bash

# Manual Test Script for TICKET 11: Client Provisioning Service
# This script tests the automatic provisioning of default templates when creating a client

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

if [ -z "$ADMIN_TOKEN" ]; then
  echo "Error: ADMIN_TOKEN environment variable is required"
  echo "Usage: ADMIN_TOKEN=your-token ./manual-test-provisioning.sh"
  exit 1
fi

echo "=========================================="
echo "TICKET 11: Client Provisioning Test"
echo "=========================================="
echo ""

# Generate unique client name
TIMESTAMP=$(date +%s)
CLIENT_NAME="Test Provisioning Client $TIMESTAMP"
CLIENT_SLUG="test-provisioning-$TIMESTAMP"

echo "Step 1: Create a new client"
echo "----------------------------"
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/clients" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$CLIENT_NAME\",
    \"slug\": \"$CLIENT_SLUG\",
    \"country\": \"NL\"
  }")

echo "$CREATE_RESPONSE" | jq '.'

# Extract client_id
CLIENT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.client.id')

if [ "$CLIENT_ID" = "null" ] || [ -z "$CLIENT_ID" ]; then
  echo ""
  echo "❌ FAILED: Could not create client or extract client_id"
  exit 1
fi

echo ""
echo "✅ Client created successfully"
echo "   Client ID: $CLIENT_ID"
echo ""

# Check provisioning counts in response
TAX_CALENDAR_COUNT=$(echo "$CREATE_RESPONSE" | jq -r '.data.provisioning.tax_calendar_count')
RISK_MATRIX_COUNT=$(echo "$CREATE_RESPONSE" | jq -r '.data.provisioning.risk_matrix_count')
RISK_CONTROL_COUNT=$(echo "$CREATE_RESPONSE" | jq -r '.data.provisioning.risk_control_count')
TAX_FUNCTION_COUNT=$(echo "$CREATE_RESPONSE" | jq -r '.data.provisioning.tax_function_count')

echo "Provisioning Summary from Response:"
echo "  - Tax Calendar Entries: $TAX_CALENDAR_COUNT"
echo "  - Risk Matrix Entries: $RISK_MATRIX_COUNT"
echo "  - Risk Control Rows: $RISK_CONTROL_COUNT"
echo "  - Tax Function Rows: $TAX_FUNCTION_COUNT"
echo ""

# Verify expected counts
if [ "$TAX_CALENDAR_COUNT" != "6" ]; then
  echo "⚠️  WARNING: Expected 6 tax calendar entries, got $TAX_CALENDAR_COUNT"
fi
if [ "$RISK_MATRIX_COUNT" != "4" ]; then
  echo "⚠️  WARNING: Expected 4 risk matrix entries, got $RISK_MATRIX_COUNT"
fi
if [ "$RISK_CONTROL_COUNT" != "4" ]; then
  echo "⚠️  WARNING: Expected 4 risk control rows, got $RISK_CONTROL_COUNT"
fi
if [ "$TAX_FUNCTION_COUNT" != "5" ]; then
  echo "⚠️  WARNING: Expected 5 tax function rows, got $TAX_FUNCTION_COUNT"
fi

echo ""
echo "Step 2: Create a client user to access the data"
echo "------------------------------------------------"

# Create a client user for this client
USER_EMAIL="test-user-$TIMESTAMP@example.com"
INVITE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/users/invite" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER_EMAIL\",
    \"role\": \"client\",
    \"client_id\": \"$CLIENT_ID\",
    \"full_name\": \"Test User\"
  }")

echo "$INVITE_RESPONSE" | jq '.'

USER_ID=$(echo "$INVITE_RESPONSE" | jq -r '.data.user.id')

if [ "$USER_ID" = "null" ] || [ -z "$USER_ID" ]; then
  echo ""
  echo "❌ FAILED: Could not create user"
  exit 1
fi

echo ""
echo "✅ User created successfully"
echo "   User ID: $USER_ID"
echo "   Email: $USER_EMAIL"
echo ""

echo "=========================================="
echo "Manual Verification Steps:"
echo "=========================================="
echo ""
echo "To complete the test, you need to:"
echo ""
echo "1. Get a JWT token for the created user:"
echo "   - Use the invitation token or generate a test JWT with:"
echo "     node generate-token.js $USER_ID client $CLIENT_ID"
echo ""
echo "2. Verify Tax Calendar entries exist:"
echo "   curl -X GET \"$BASE_URL/api/tax-calendar?limit=50\" \\"
echo "     -H \"Authorization: Bearer <client-token>\""
echo ""
echo "   Expected: 6 entries (4 VAT quarterly, 1 CIT annual, 1 Payroll monthly)"
echo ""
echo "3. Verify Risk Matrix entries exist:"
echo "   curl -X GET \"$BASE_URL/api/tax-risk-matrix?limit=50\" \\"
echo "     -H \"Authorization: Bearer <client-token>\""
echo ""
echo "   Expected: 4 entries (VAT-001, CIT-001, TP-001, WHT-001)"
echo ""
echo "4. Verify Risk Control rows exist:"
echo "   curl -X GET \"$BASE_URL/api/tax-risk-controls?limit=50\" \\"
echo "     -H \"Authorization: Bearer <client-token>\""
echo ""
echo "   Expected: 4 rows with control descriptions and monitoring frequencies"
echo ""
echo "5. Verify Tax Function rows exist:"
echo "   curl -X GET \"$BASE_URL/api/tax-function?limit=50\" \\"
echo "     -H \"Authorization: Bearer <client-token>\""
echo ""
echo "   Expected: 5 rows (VAT Compliance, CIT, Transfer Pricing, Payroll, Risk Management)"
echo ""
echo "=========================================="
echo "Cleanup (Optional):"
echo "=========================================="
echo ""
echo "To clean up the test data:"
echo "  - Delete client: DELETE $BASE_URL/api/admin/clients/$CLIENT_ID"
echo "  - This will cascade delete all related data due to foreign key constraints"
echo ""
