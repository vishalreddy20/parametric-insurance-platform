#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
: "${DRUNIX_RUNTIME:?Point to the running writable DRUNIX sample checkout.}"
umask 077
run_dir=$(mktemp -d /tmp/parashield-services-test.XXXXXX)
pids=()
cleanup() {
  local result=$?
  if (( ${#pids[@]} )); then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
  if (( result != 0 )); then
    for log in "$run_dir/"*.log; do
      [[ ! -f "$log" ]] || tail -12 "$log" >&2
    done
  fi
  rm -rf -- "$run_dir"
}
trap cleanup EXIT

npm --prefix gateway run build
npm --prefix oracles run build
export PARASHIELD_ORIGIN=http://127.0.0.1:15173
export PARASHIELD_ACCOUNT_DB="$run_dir/accounts.sqlite"
unset PARASHIELD_PASSWORD_PEPPER
export PARASHIELD_DEMO_IDENTITY_DIR="$run_dir/msp"
export PARASHIELD_DEMO_MASTER="$(openssl rand -hex 32)"
export PARASHIELD_JWT_KEY="$(openssl rand -hex 32)"
export PARASHIELD_PII_SALT_KEY="$(openssl rand -hex 32)"
export PARASHIELD_UPI_AUTHORIZATION="Bearer $(openssl rand -hex 32)"
export PARASHIELD_GATEWAY_CONFIG="$PARASHIELD_DEMO_IDENTITY_DIR/gateway-config.json"
export PARASHIELD_GATEWAY_STATE_DIR="$run_dir/ledger-data/gateway"
export PARASHIELD_UPI_STATE_DIR="$run_dir/ledger-data/mock-upi"
export PARASHIELD_GATEWAY_PORT="${PARASHIELD_GATEWAY_TEST_PORT:-18080}"
export PARASHIELD_GATEWAY_HOST=127.0.0.1
export PARASHIELD_ORACLE_PORT="${PARASHIELD_ORACLE_TEST_PORT:-18081}"
export PARASHIELD_UPI_PORT="${PARASHIELD_UPI_TEST_PORT:-18082}"
export PARASHIELD_GATEWAY_URL="http://127.0.0.1:$PARASHIELD_GATEWAY_PORT"
export PARASHIELD_ORACLE_URL="http://127.0.0.1:$PARASHIELD_ORACLE_PORT"
export PARASHIELD_UPI_URL="http://127.0.0.1:$PARASHIELD_UPI_PORT"
export PARASHIELD_UPI_FAILURE_BPS=0 PARASHIELD_UPI_LATENCY_MS=20

code_for() {
  node --input-type=module -e "import {createHmac} from 'node:crypto';process.stdout.write(createHmac('sha256',Buffer.from(process.env.PARASHIELD_DEMO_MASTER,'hex')).update('login:'+process.argv[1]).digest('hex'))" "$1"
}
export PARASHIELD_BANK_ACCESS_CODE="$(code_for bank)"
export PARASHIELD_ORACLE_1_ACCESS_CODE="$(code_for oracle-1)"
export PARASHIELD_ORACLE_2_ACCESS_CODE="$(code_for oracle-2)"
export PARASHIELD_ORACLE_3_ACCESS_CODE="$(code_for oracle-3)"
node scripts/runtime-identities.mjs
node gateway/dist/src/index.js > "$run_dir/gateway.log" 2>&1 &
pids+=("$!")
node oracles/dist/index.js > "$run_dir/oracles.log" 2>&1 &
pids+=("$!")
node mock-upi/index.mjs > "$run_dir/mock-upi.log" 2>&1 &
pids+=("$!")
node oracles/test/integration.mjs
