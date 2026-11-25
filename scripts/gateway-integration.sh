#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
: "${DRUNIX_RUNTIME:?Point to the running writable DRUNIX sample checkout.}"
umask 077
run_dir=$(mktemp -d /tmp/parashield-gateway-test.XXXXXX)
gateway_pid=
cleanup() {
  local result=$?
  if [[ -n "$gateway_pid" ]]; then
    kill "$gateway_pid" 2>/dev/null || true
    wait "$gateway_pid" || true
  fi
  if (( result != 0 )) && [[ -f "$run_dir/gateway.log" ]]; then
    tail -25 "$run_dir/gateway.log" >&2
  fi
  rm -rf -- "$run_dir"
}
trap cleanup EXIT

npm --prefix gateway run build
export PARASHIELD_ORIGIN=http://127.0.0.1:15173
export PARASHIELD_ACCOUNT_DB="$run_dir/accounts.sqlite"
unset PARASHIELD_PASSWORD_PEPPER
export PARASHIELD_DEMO_IDENTITY_DIR="$run_dir/msp"
export PARASHIELD_DEMO_MASTER="$(openssl rand -hex 32)"
export PARASHIELD_JWT_KEY="$(openssl rand -hex 32)"
export PARASHIELD_PII_SALT_KEY="$(openssl rand -hex 32)"
export PARASHIELD_GATEWAY_CONFIG="$PARASHIELD_DEMO_IDENTITY_DIR/gateway-config.json"
export PARASHIELD_GATEWAY_STATE_DIR="$run_dir/ledger-data"
export PARASHIELD_GATEWAY_PORT="${PARASHIELD_GATEWAY_TEST_PORT:-18080}"
export PARASHIELD_GATEWAY_HOST=127.0.0.1
unset PARASHIELD_UPI_URL PARASHIELD_UPI_AUTHORIZATION

node scripts/runtime-identities.mjs
node gateway/dist/src/index.js > "$run_dir/gateway.log" 2>&1 &
gateway_pid=$!
node gateway/test/integration.mjs
