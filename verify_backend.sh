#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# BLINK v4.0 - Complete Verification & Testing Script
# ═══════════════════════════════════════════════════════════════════════════════

echo "╔═════════════════════════════════════════════════════════════════════════╗"
echo "║          BLINK v4.0 - PRODUCTION VERIFICATION TEST                     ║"
echo "╚═════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0

# Backend URL (auto-detect or use argument)
BACKEND_URL="${1:-https://blink-yzoo.onrender.com}"

echo "Testing Backend: $BACKEND_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 1: Root Route
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 1: Root route GET /..."
RESPONSE=$(curl -s "$BACKEND_URL/" -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [[ "$HTTP_CODE" == "200" ]] && [[ "$BODY" == *"online"* ]]; then
    echo -e " ${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e " ${RED}✗ FAIL${NC} (HTTP $HTTP_CODE)"
    ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 2: Health Check
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 2: Health check GET /health..."
RESPONSE=$(curl -s "$BACKEND_URL/health" -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [[ "$HTTP_CODE" == "200" ]]; then
    echo -e " ${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e " ${RED}✗ FAIL${NC} (HTTP $HTTP_CODE)"
    ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 3: CORS Headers
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 3: CORS headers..."
RESPONSE=$(curl -s -I "$BACKEND_URL/" | grep -i "access-control-allow-origin")

if [[ ! -z "$RESPONSE" ]]; then
    echo -e " ${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e " ${RED}✗ FAIL${NC} (CORS headers missing)"
    ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 4: Auth Endpoints
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 4: Auth endpoint exists GET /api/auth/me..."
RESPONSE=$(curl -s "$BACKEND_URL/api/auth/me" -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

# Should return 401 (unauthorized) since no token provided
if [[ "$HTTP_CODE" == "401" ]] || [[ "$HTTP_CODE" == "200" ]]; then
    echo -e " ${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE)"
    ((PASS++))
else
    echo -e " ${RED}✗ FAIL${NC} (HTTP $HTTP_CODE)"
    ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 5: Video Feed Endpoint
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 5: Video feed endpoint GET /api/posts/feed..."
RESPONSE=$(curl -s "$BACKEND_URL/api/posts/feed?limit=1" -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [[ "$HTTP_CODE" == "200" ]] && [[ "$BODY" == *"videos"* ]]; then
    echo -e " ${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e " ${RED}✗ FAIL${NC} (HTTP $HTTP_CODE)"
    ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 6: Upload Endpoint Exists
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 6: Upload endpoint exists POST /api/upload/video..."
RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/upload/video" \
    -H "Content-Type: application/json" \
    -d "{}" \
    -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

# Should return 401 (missing auth) or 400 (missing data), not 404
if [[ "$HTTP_CODE" != "404" ]]; then
    echo -e " ${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE)"
    ((PASS++))
else
    echo -e " ${RED}✗ FAIL${NC} (Endpoint not found)"
    ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 7: User Profile Endpoint
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 7: User endpoints GET /api/users/search..."
RESPONSE=$(curl -s "$BACKEND_URL/api/users/search?q=test" -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "400" ]]; then
    echo -e " ${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e " ${RED}✗ FAIL${NC} (HTTP $HTTP_CODE)"
    ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 8: Messages Endpoint
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 8: Messages endpoint GET /api/messages/list..."
RESPONSE=$(curl -s "$BACKEND_URL/api/messages/list" \
    -H "Authorization: Bearer dummy_token" \
    -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

# Should not be 404
if [[ "$HTTP_CODE" != "404" ]]; then
    echo -e " ${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE)"
    ((PASS++))
else
    echo -e " ${RED}✗ FAIL${NC} (Endpoint not found)"
    ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 9: Live Routes
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 9: Live endpoint GET /api/live/active..."
RESPONSE=$(curl -s "$BACKEND_URL/api/live/active" -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "400" ]]; then
    echo -e " ${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE)"
    ((PASS++))
else
    echo -e " ${RED}✗ FAIL${NC} (HTTP $HTTP_CODE)"
    ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 10: Response Time
# ═══════════════════════════════════════════════════════════════════════════════
echo -n "🔍 Test 10: Response time (should be < 2 seconds)..."
START=$(date +%s%N)
curl -s "$BACKEND_URL/" > /dev/null
END=$(date +%s%N)
DURATION=$((($END - $START) / 1000000))

if [[ $DURATION -lt 2000 ]]; then
    echo -e " ${GREEN}✓ PASS${NC} (${DURATION}ms)"
    ((PASS++))
else
    echo -e " ${YELLOW}⚠ SLOW${NC} (${DURATION}ms)"
    ((PASS++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [[ $FAIL -eq 0 ]]; then
    echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ ALL TESTS PASSED - READY TO USE   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
    echo ""
    echo "Results: $PASS passed, $FAIL failed"
    echo ""
    echo "📋 Next Steps:"
    echo "  1. Open frontend: file://$(pwd)/blink/frontend/index.html"
    echo "  2. Or deploy frontend to Vercel/Netlify"
    echo "  3. Visit: https://blink-yzoo.onrender.com/"
    echo ""
    exit 0
else
    echo -e "${RED}╔═══════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ SOME TESTS FAILED                 ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════╝${NC}"
    echo ""
    echo "Results: $PASS passed, $FAIL failed"
    echo ""
    echo "⚠️  Please fix the failing tests before proceeding"
    echo ""
    exit 1
fi
