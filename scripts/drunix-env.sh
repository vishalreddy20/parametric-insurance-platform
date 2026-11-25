#!/usr/bin/env bash

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
: "${DRUNIX_RUNTIME:?Set DRUNIX_RUNTIME to a writable DRUNIX checkout separate from the read-only reference.}"

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

runtime_root=$(cd -- "$DRUNIX_RUNTIME" && pwd -P) ||
  fail 'DRUNIX_RUNTIME is not an accessible checkout.'
if [[ -d "$HOME/drunix" && "$runtime_root" -ef "$HOME/drunix" ]]; then
  fail 'DRUNIX_RUNTIME must be separate from the read-only $HOME/drunix reference.'
fi
cd -- "$runtime_root/drunix-network/test-network" ||
  fail 'DRUNIX_RUNTIME does not contain the documented sample test network.'
export PATH="$PWD/../../build/bin:$PATH"
export FABRIC_CFG_PATH="$PWD/../config"
export TEST_NETWORK_HOME="$PWD"

command -v peer >/dev/null || fail 'Build the DRUNIX binaries using the sample README.'
command -v jq >/dev/null || fail 'jq is required by the DRUNIX sample.'
docker info >/dev/null || fail 'The Docker daemon is unavailable.'

channel=parashield
chaincode=parashield

# The upstream helper expects unset variables and supplies its own defaults.
with_peer() (
  set +u
  local org=$1 peer_index=$2
  shift 2
  unset OVERRIDE_ORG
  source ./scripts/envVar.sh >/dev/null
  setGlobals "$org" "$peer_index" >/dev/null
  "$@"
)

channel_joined() {
  local org peer_index
  for org in 1 2; do
    for peer_index in 0 1; do
      with_peer "$org" "$peer_index" peer channel list 2>/dev/null |
        grep -Fx "$channel" >/dev/null || return 1
    done
  done
}

committed() {
  with_peer 1 1 peer lifecycle chaincode querycommitted     --channelID "$channel" --name "$chaincode" --output json
}
