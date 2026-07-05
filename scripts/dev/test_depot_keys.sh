#!/usr/bin/env bash
# Test script for GET /api/games/:app_id/depot-keys endpoint
# Requires: curl, jq, and a running Y-Core API server on localhost:3000
#
# Usage:
#   API_BASE=http://localhost:3000 TEST_EMAIL=test@example.com TEST_PASSWORD=test123 ./test_depot_keys.sh

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000}"
TEST_EMAIL="${TEST_EMAIL:-test@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-test123}"
TEST_APP_ID="${TEST_APP_ID:-70}"

echo "=== Y-Core depot-keys endpoint test ==="
echo "API: $API_BASE"
echo ""

# 1. Login → obtener JWT
echo "1. Logging in as $TEST_EMAIL..."
LOGIN_RESP=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.access_token // empty')

if [ -z "$TOKEN" ]; then
  echo "   FAIL: Could not obtain access_token"
  echo "   Response: $LOGIN_RESP"
  exit 1
fi
echo "   OK: Got JWT token"
echo ""

# 2. Request install (registra install_request)
echo "2. Requesting install for app_id=$TEST_APP_ID..."
INSTALL_RESP=$(curl -s -X POST "$API_BASE/api/games/$TEST_APP_ID/install" \
  -H "Authorization: Bearer $TOKEN")
echo "   Response: $INSTALL_RESP"
echo ""

# 3. Test: JWT válido + install_request activo → 200
echo "3. Test: Valid JWT + active install_request → expect 200..."
DEPOT_RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/api/games/$TEST_APP_ID/depot-keys" \
  -H "Authorization: Bearer $TOKEN")
DEPOT_CODE=$(echo "$DEPOT_RESP" | tail -1)
DEPOT_BODY=$(echo "$DEPOT_RESP" | head -n -1)

if [ "$DEPOT_CODE" = "200" ]; then
  echo "   PASS: HTTP 200"
  echo "   Body: $DEPOT_BODY"
else
  echo "   FAIL: Expected 200, got $DEPOT_CODE"
  echo "   Body: $DEPOT_BODY"
fi
echo ""

# 4. Test: JWT válido sin install_request → 403
echo "4. Test: Valid JWT, no install_request for app_id=99999 → expect 403..."
NOKEY_RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/api/games/99999/depot-keys" \
  -H "Authorization: Bearer $TOKEN")
NOKEY_CODE=$(echo "$NOKEY_RESP" | tail -1)
NOKEY_BODY=$(echo "$NOKEY_RESP" | head -n -1)

if [ "$NOKEY_CODE" = "403" ]; then
  echo "   PASS: HTTP 403"
  echo "   Body: $NOKEY_BODY"
else
  echo "   FAIL: Expected 403, got $NOKEY_CODE"
  echo "   Body: $NOKEY_BODY"
fi
echo ""

# 5. Test: Sin JWT → 401
echo "5. Test: No JWT → expect 401..."
NOAUTH_RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/api/games/$TEST_APP_ID/depot-keys")
NOAUTH_CODE=$(echo "$NOAUTH_RESP" | tail -1)
NOAUTH_BODY=$(echo "$NOAUTH_RESP" | head -n -1)

if [ "$NOAUTH_CODE" = "401" ]; then
  echo "   PASS: HTTP 401"
  echo "   Body: $NOAUTH_BODY"
else
  echo "   FAIL: Expected 401, got $NOAUTH_CODE"
  echo "   Body: $NOAUTH_BODY"
fi
echo ""

echo "=== Test complete ==="
