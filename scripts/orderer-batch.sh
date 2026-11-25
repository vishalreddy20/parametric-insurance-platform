#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/drunix-env.sh"
timeout=${1:-}
[[ "$timeout" =~ ^[1-9][0-9]*(ms|s)$ ]] || fail 'Supply a batch duration such as 250ms or 2s.'
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
orderer=( -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls
  --cafile "$PWD/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem" )
fetch_config() {
  with_peer 1 1 peer channel fetch config "$scratch/block" -c "$channel" "${orderer[@]}"
  configtxlator proto_decode --input "$scratch/block" --type common.Block |
    jq '.data.data[0].payload.data.config' > "$scratch/original.json"
}
fetch_config
field='.channel_group.groups.Orderer.values.BatchTimeout.value.timeout'
current=$(jq -er "$field" "$scratch/original.json")
if [[ "$current" != "$timeout" ]]; then
  jq --arg duration "$timeout" "$field = \$duration" "$scratch/original.json" > "$scratch/updated.json"
  for type in original updated; do
    configtxlator proto_encode --input "$scratch/$type.json" --type common.Config --output "$scratch/$type.pb"
  done
  configtxlator compute_update --channel_id "$channel" --original "$scratch/original.pb" --updated "$scratch/updated.pb" --output "$scratch/update.pb"
  configtxlator proto_decode --input "$scratch/update.pb" --type common.ConfigUpdate |
    jq --arg channel "$channel" '{payload:{header:{channel_header:{channel_id:$channel,type:2}},data:{config_update:.}}}' |
    configtxlator proto_encode --type common.Envelope --output "$scratch/envelope.pb"
  CORE_PEER_LOCALMSPID=OrdererMSP \
    CORE_PEER_MSPCONFIGPATH="$PWD/organizations/ordererOrganizations/example.com/users/Admin@example.com/msp" \
    peer channel update -c "$channel" -f "$scratch/envelope.pb" "${orderer[@]}"
  for attempt in {1..10}; do
    fetch_config
    current=$(jq -er "$field" "$scratch/original.json")
    [[ "$current" != "$timeout" ]] || break
    sleep 1
  done
fi
[[ "$current" == "$timeout" ]] || fail 'The orderer batch timeout was not committed.'
printf 'Committed orderer batch timeout: %s\n' "$current"
