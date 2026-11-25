#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/drunix-env.sh"

channel_joined || fail 'Run scripts/network-up.sh before the smoke test.'
committed >/dev/null || fail 'Run scripts/deploy-chaincode.sh before the smoke test.'

policy_id=simulated-smoke-policy
fixture='{"identity":"SIMULATED","phone":"SIMULATED","bank":"SIMULATED","salt":"8231efa6bdbf75a71cf3eedf872d7e31ad04ec31f7d4793aa5734e3285e96a4e"}'
expected_hash=$(printf '%s' "$fixture" | sha256sum | cut -d ' ' -f 1)
query=$(jq -nc --arg id "$policy_id" '{Args:["PolicyContract:GetPolicy",$id]}')
invoke=$(jq -nc --arg id "$policy_id" '{Args:["PolicyContract:CreatePolicy",$id]}')
transient=$(printf '%s' "$fixture" | base64 -w0 | jq -Rc '{workerPII:.}')

verify_policy() {
  with_peer 1 0 peer chaincode query -C "$channel" -n "$chaincode" -c "$query" 2>/dev/null |
    jq -e --arg id "$policy_id" --arg hash "$expected_hash"       '. == {id:$id,workerHash:$hash}' >/dev/null
}

if ! verify_policy; then
  with_peer 2 0 peer chaincode invoke -o localhost:7050 --tls     --cafile "$PWD/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem"     --peerAddresses localhost:7051     --tlsRootCertFiles "$PWD/organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem"     --peerAddresses localhost:9051     --tlsRootCertFiles "$PWD/organizations/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem"     -C "$channel" -n "$chaincode" -c "$invoke" --transient "$transient" ||
    fail 'Could not submit the simulated policy enrollment.'
fi

for ((attempt=1; attempt<=30; attempt++)); do
  if verify_policy; then
    printf '%s\n' 'Smoke test passed. The simulated policy and salted hash match the ledger response.'
    exit 0
  fi
  sleep 2
done
fail 'Timed out waiting to read the expected policy from the ledger.'
