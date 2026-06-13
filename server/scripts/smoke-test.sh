#!/usr/bin/env bash
# F0-20: End-to-end smoke test for VPS Management API.
# Runs against a live server (http://localhost:5000 by default).
# Usage: ADMIN_EMAIL=admin@local ADMIN_PASSWORD=secret bash smoke-test.sh

set -e
API="${API:-http://localhost:5000}"
EMAIL="${ADMIN_EMAIL:?ADMIN_EMAIL env var required}"
PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD env var required}"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

echo "==> Health check"
status=$(curl -fsS -o /dev/null -w '%{http_code}' "$API/health" || echo "000")
[ "$status" = "200" ] && pass "GET /health 200" || fail "GET /health expected 200, got $status"

echo "==> Login"
LOGIN=$(curl -fsS -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token||''))")
[ -n "$TOKEN" ] && pass "login returned token" || fail "no token in /login response"

echo "==> List VPS (admin)"
VPS=$(curl -fsS "$API/api/vps" -H "Authorization: Bearer $TOKEN")
echo "$VPS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);Array.isArray(a)?console.log('  ok'):console.log('  bad')})" \
  && pass "GET /api/vps returns array" || fail "GET /api/vps not array"

echo "==> List rules (should be 401 without token, 200 with)"
status=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/rules")
[ "$status" = "401" ] && pass "GET /api/rules 401 without token" || fail "GET /api/rules expected 401, got $status"
curl -fsS "$API/api/rules" -H "Authorization: Bearer $TOKEN" -o /dev/null \
  && pass "GET /api/rules 200 with token" || fail "GET /api/rules with token failed"

echo "==> Create CPU rule (F0-1: condition >)"
RULE=$(curl -fsS -X POST "$API/api/rules" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"metric":"CPU","condition":">","threshold":80,"durationMin":1,"action":"ALERT"}')
RULE_ID=$(echo "$RULE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id||''))")
[ -n "$RULE_ID" ] && pass "POST /api/rules with condition:'>' accepted" || fail "rule create rejected condition:'>' (F0-1 broken?)"

if [ -n "$RULE_ID" ]; then
  echo "==> Delete CPU rule"
  curl -fsS -X DELETE "$API/api/rules/$RULE_ID" -H "Authorization: Bearer $TOKEN" -o /dev/null \
    && pass "DELETE /api/rules/$RULE_ID" || fail "DELETE rule failed"
fi

echo "==> Notifications endpoint"
curl -fsS "$API/api/notifications" -H "Authorization: Bearer $TOKEN" -o /dev/null \
  && pass "GET /api/notifications" || fail "GET /api/notifications failed"

echo "==> Preferences endpoint"
curl -fsS "$API/api/settings/preferences" -H "Authorization: Bearer $TOKEN" -o /dev/null \
  && pass "GET /api/settings/preferences" || fail "GET /api/settings/preferences failed"

echo
echo "All smoke tests passed."
