#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/drunix-env.sh"

channel_joined || fail 'Run scripts/network-up.sh before deploying.'
version=3.1
if committed 2>/dev/null | jq -e --arg version "$version" '.version == $version' >/dev/null; then
  printf '%s\n' "parashield $version is already committed."
  exit 0
fi

# The upstream packager vendors dependencies into its source directory.
build_dir=$(mktemp -d /tmp/parashield-chaincode.XXXXXX)
trap 'rm -rf -- "$build_dir"' EXIT
mkdir "$build_dir/source"
cp "$repo_root/chaincode/"{go.mod,go.sum,*.go} "$build_dir/source/"
cp "$repo_root/network/collections.json" "$build_dir/collections.json"

for image in npcioss/drunix-ccenv:1.0 npcioss/drunix-baseos:1.0; do
  docker image inspect "$image" >/dev/null 2>&1 ||
    docker pull "$image" || fail "Could not provision DRUNIX build image $image."
done

./network.sh deployCC -c "$channel" -ccn "$chaincode" -ccp "$build_dir/source" \
  -ccl go -ccv "$version" -ccep "AND('Org1MSP.peer','Org2MSP.peer')" \
  -cccg "$build_dir/collections.json" ||
    fail 'DRUNIX chaincode lifecycle deployment failed.'
committed | jq -e --arg version "$version" '.version == $version' >/dev/null || fail 'The parashield chaincode definition was not found after deployment.'
