#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(dirname -- "${BASH_SOURCE[0]}")/drunix-env.sh"
seconds=${1:-}
[[ "$seconds" =~ ^([0-9]+(\.[0-9]+)?|\.[0-9]+)$ ]] &&
  jq -en --arg duration "$seconds" '($duration | tonumber) > 0 and ($duration | tonumber) <= 10' >/dev/null ||
  fail 'Supply a block-cut interval in seconds, greater than zero and at most 10.'
seconds=$(jq -n --arg duration "$seconds" '$duration | tonumber')
raft_dir=/tmp/drunix-sharding/data_store/orderer/etcdraft
work="$PWD/.parashield-orderer"
mkdir -p "$work"
socket="${DOCKER_HOST:-/var/run/docker.sock}"
export DOCKER_SOCK="${socket#unix://}"
compose=(docker compose -f compose/compose-test-net.yaml -f compose/docker/docker-compose-test-net.yaml)
raft_source=$(docker inspect orderer.example.com --format '{{range .Mounts}}{{if eq .Destination "/tmp/drunix-sharding/data_store/orderer/etcdraft"}}{{.Source}}{{end}}{{end}}')
if [[ "$raft_source" != "$work/"* ]]; then
  scratch=$(mktemp -d "$work/raft.XXXXXX")
  docker stop orderer.example.com >/dev/null
  if ! docker cp "orderer.example.com:$raft_dir/." "$scratch"; then
    docker start orderer.example.com >/dev/null
    fail 'Could not preserve the sample Raft state before re-creation.'
  fi
  raft_source=$scratch
fi
jq -n --arg seconds "$seconds" --arg source "$raft_source" --arg target "$raft_dir" '{
  services: {"orderer.example.com": {
    environment: {ORDERER_GENERAL_DRUNIX_BLOCKCUTTIME:$seconds},
    volumes: [{type:"bind",source:$source,target:$target}]
  }}
}' > "$work/override.json"
"${compose[@]}" -f "$work/override.json" up -d --no-deps orderer.example.com
for attempt in {1..20}; do
  if docker logs orderer.example.com 2>&1 | grep -F "BlockCutTime:$seconds " >/dev/null; then
    printf 'Orderer reports active block-cut interval: %ss\n' "$seconds"
    exit 0
  fi
  sleep 1
done
fail 'The running orderer did not report the requested DRUNIX block-cut interval.'
