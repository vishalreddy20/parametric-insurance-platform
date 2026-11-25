#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/drunix-env.sh"

./network.sh down -s yugabyte || fail 'DRUNIX sample cleanup failed.'

peer_containers=$(docker compose -f compose/compose-test-net.yaml \
  -f compose/docker/docker-compose-test-net.yaml -f compose/compose-ca.yaml ps --all --quiet) ||
  fail 'Could not check DRUNIX sample peer container cleanup.'
db_containers=$(docker compose -f scripts/yugabyte/compose.yaml ps --all --quiet) ||
  fail 'Could not check DRUNIX sample database container cleanup.'
[[ -z "$peer_containers$db_containers" ]] || fail 'DRUNIX sample containers remain after cleanup.'
